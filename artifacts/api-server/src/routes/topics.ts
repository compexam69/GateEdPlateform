import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

// ── Shared audit helper (inline to avoid circular imports) ───────────────────
async function logTopicVisibility(
  actorId: string,
  topicId: string,
  prev: { allowed_roles: string[]; is_creator_only: boolean },
  next: { allowed_roles: string[]; is_creator_only: boolean },
) {
  await supabase.from("audit_logs").insert({
    user_id: actorId,
    action: "topic_visibility_updated",
    resource_type: "topic",
    resource_id: topicId,
    metadata: { prev_allowed_roles: prev.allowed_roles, new_allowed_roles: next.allowed_roles, prev_is_creator_only: prev.is_creator_only, new_is_creator_only: next.is_creator_only },
  });
}

// ── GET /chapters/:chapterId/topics ──────────────────────────────────────────
//
// Role-based access filtering:
//   student  → is_creator_only=false  AND  allowed_roles ∋ 'student'
//   admin    → is_creator_only=false  AND  allowed_roles ∋ 'admin'
//   super_admin →  (own topics)
//               OR (is_creator_only=false AND allowed_roles ∋ 'super_admin')
//               OR (explicitly granted via content_access_grants)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/chapters/:chapterId/topics", requireAuth, async (req: AuthRequest, res) => {
  const chapterId = req.params["chapterId"];
  const role = req.user!.role;
  const userId = req.user!.id;

  let query = supabase
    .from("topics")
    .select("*, lectures(*)")
    .eq("chapter_id", chapterId)
    .order("order_index");

  if (role === "student" || role === "admin") {
    query = (query as typeof query)
      .eq("is_creator_only", false)
      .filter("allowed_roles", "cs", `{${role}}`);
  } else if (role === "super_admin") {
    // Fetch topic IDs explicitly granted to this SA
    const { data: grants } = await supabase
      .from("content_access_grants")
      .select("content_id")
      .eq("granted_to", userId)
      .eq("content_type", "topic");
    const grantedIds = (grants ?? []).map((g) => g.content_id as string);

    const orParts: string[] = [
      `creator_id.eq.${userId}`,
      `and(is_creator_only.eq.false,allowed_roles.cs.{super_admin})`,
    ];
    if (grantedIds.length > 0) {
      orParts.push(`id.in.(${grantedIds.join(",")})`);
    }
    query = (query as typeof query).or(orParts.join(","));
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── POST /chapters/:chapterId/topics ─────────────────────────────────────────
router.post("/chapters/:chapterId/topics", requireAdmin, async (req: AuthRequest, res) => {
  const { title, description, order_index, telegram_link, allowed_roles, is_creator_only } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }

  // Validate allowed_roles if provided
  const VALID_ROLES = ["student", "admin", "super_admin"];
  const roles: string[] = Array.isArray(allowed_roles)
    ? allowed_roles.filter((r: unknown) => VALID_ROLES.includes(r as string))
    : VALID_ROLES;
  if (roles.length === 0) {
    res.status(400).json({ error: "At least one role must be selected in allowed_roles." });
    return;
  }

  const { data, error } = await supabase
    .from("topics")
    .insert({
      chapter_id: req.params["chapterId"],
      title,
      description,
      order_index,
      telegram_link: telegram_link || null,
      creator_id: req.user!.id,
      allowed_roles: roles,
      is_creator_only: is_creator_only === true,
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Always create a lectures row so TopicDetailPage can record lecture clicks even
  // before a telegram_link is configured. Without this row, `topic.lectures[0]` is
  // undefined and handleLectureClick always fails with "No lecture" toast.
  await supabase.from("lectures").insert({
    topic_id: data.id,
    telegram_link: telegram_link || null,
  });

  res.status(201).json(data);
});

// ── PATCH /topics/:topicId ────────────────────────────────────────────────────
router.patch("/topics/:topicId", requireAdmin, async (req: AuthRequest, res) => {
  const topicId = req.params["topicId"] as string;
  const { title, description, order_index, is_active, telegram_link, allowed_roles, is_creator_only } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates["title"] = title;
  if (description !== undefined) updates["description"] = description;
  if (order_index !== undefined) updates["order_index"] = order_index;
  if (is_active !== undefined) updates["is_active"] = is_active;
  if (telegram_link !== undefined) updates["telegram_link"] = telegram_link || null;

  // Visibility fields
  const VALID_ROLES = ["student", "admin", "super_admin"];
  let rolesChanged = false;
  if (allowed_roles !== undefined) {
    const roles = (Array.isArray(allowed_roles) ? allowed_roles : [])
      .filter((r: unknown) => VALID_ROLES.includes(r as string));
    if (roles.length === 0) {
      res.status(400).json({ error: "At least one role must be selected in allowed_roles." });
      return;
    }
    updates["allowed_roles"] = roles;
    rolesChanged = true;
  }
  if (is_creator_only !== undefined) {
    updates["is_creator_only"] = is_creator_only === true;
    rolesChanged = true;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  // Fetch current topic for diff logging
  let prevVisibility: { allowed_roles: string[]; is_creator_only: boolean } | null = null;
  if (rolesChanged) {
    const { data: current } = await supabase
      .from("topics")
      .select("allowed_roles, is_creator_only")
      .eq("id", topicId)
      .single();
    if (current) prevVisibility = current as { allowed_roles: string[]; is_creator_only: boolean };
  }

  const { data, error } = await supabase
    .from("topics")
    .update(updates)
    .eq("id", topicId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Audit log for visibility changes
  if (rolesChanged && prevVisibility) {
    await logTopicVisibility(req.user!.id, topicId, prevVisibility, {
      allowed_roles: (updates["allowed_roles"] as string[] | undefined) ?? prevVisibility.allowed_roles,
      is_creator_only: (updates["is_creator_only"] as boolean | undefined) ?? prevVisibility.is_creator_only,
    });
  }

  // Keep the lectures row in sync whenever telegram_link changes
  if (telegram_link !== undefined) {
    const { data: existingLectures } = await supabase
      .from("lectures")
      .select("id")
      .eq("topic_id", topicId)
      .order("created_at")
      .limit(1);

    if (existingLectures && existingLectures.length > 0) {
      await supabase.from("lectures").update({ telegram_link: telegram_link || null }).eq("id", existingLectures[0].id);
    } else {
      await supabase.from("lectures").insert({
        topic_id: topicId,
        telegram_link: telegram_link || null,
      });
    }
  }

  res.json(data);
});

// ── POST /topics/reorder ─────────────────────────────────────────────────────
router.post("/topics/reorder", requireAdmin, async (req: AuthRequest, res) => {
  const { topics } = req.body as { topics?: Array<{ id: string; order_index: number }> };
  if (!Array.isArray(topics) || topics.length === 0) {
    res.status(400).json({ error: "topics array required" });
    return;
  }
  await Promise.all(
    topics.map(t => supabase.from("topics").update({ order_index: t.order_index }).eq("id", t.id))
  );
  res.json({ message: "Reordered" });
});

export default router;
