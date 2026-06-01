import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { isValidUuid, capText, MAX } from "../lib/sanitize";

const router = Router();

const VALID_ROLES = ["student", "admin", "super_admin"];

// ── Shared audit helper (inline to avoid circular imports) ───────────────────
async function logTopicVisibility(
  actorId: string,
  topicId: string,
  prev: { allowed_roles: string[]; is_creator_only: boolean },
  next: { allowed_roles: string[]; is_creator_only: boolean },
) {
  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "topic_visibility_updated",
    target_type: "topic",
    target_id: topicId,
    old_value: { allowed_roles: prev.allowed_roles, is_creator_only: prev.is_creator_only },
    new_value: { allowed_roles: next.allowed_roles, is_creator_only: next.is_creator_only },
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
  if (!isValidUuid(chapterId)) { res.status(400).json({ error: "Invalid chapter ID" }); return; }

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
  const chapterId = req.params["chapterId"] as string;
  if (!isValidUuid(chapterId)) { res.status(400).json({ error: "Invalid chapter ID" }); return; }

  const title = capText(req.body["title"], MAX.TITLE);
  if (!title) { res.status(400).json({ error: "title required" }); return; }

  const description = capText(req.body["description"], MAX.DESCRIPTION);
  const telegram_link = capText(req.body["telegram_link"], MAX.URL);
  const order_index = req.body["order_index"] != null ? Math.floor(Number(req.body["order_index"])) : 0;
  const is_creator_only = req.body["is_creator_only"] === true;

  const roles: string[] = Array.isArray(req.body["allowed_roles"])
    ? (req.body["allowed_roles"] as unknown[]).filter((r: unknown) => VALID_ROLES.includes(r as string)) as string[]
    : VALID_ROLES;

  if (roles.length === 0) {
    res.status(400).json({ error: "At least one role must be selected in allowed_roles." });
    return;
  }

  const { data, error } = await supabase
    .from("topics")
    .insert({
      chapter_id: chapterId,
      title,
      description,
      order_index,
      telegram_link: telegram_link || null,
      creator_id: req.user!.id,
      allowed_roles: roles,
      is_creator_only,
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
  if (!isValidUuid(topicId)) { res.status(400).json({ error: "Invalid topic ID" }); return; }

  const updates: Record<string, unknown> = {};
  if (req.body["title"] !== undefined) {
    const title = capText(req.body["title"], MAX.TITLE);
    if (!title) { res.status(400).json({ error: "title must be a non-empty string" }); return; }
    updates["title"] = title;
  }
  if (req.body["description"] !== undefined) updates["description"] = capText(req.body["description"], MAX.DESCRIPTION);
  if (req.body["order_index"] !== undefined) {
    const idx = Math.floor(Number(req.body["order_index"]));
    if (Number.isFinite(idx)) updates["order_index"] = idx;
  }
  if (req.body["is_active"] !== undefined) updates["is_active"] = Boolean(req.body["is_active"]);
  if (req.body["telegram_link"] !== undefined) updates["telegram_link"] = capText(req.body["telegram_link"], MAX.URL) || null;

  // Visibility fields
  let rolesChanged = false;
  if (req.body["allowed_roles"] !== undefined) {
    const roles = (Array.isArray(req.body["allowed_roles"]) ? req.body["allowed_roles"] : [] as unknown[])
      .filter((r: unknown) => VALID_ROLES.includes(r as string)) as string[];
    if (roles.length === 0) {
      res.status(400).json({ error: "At least one role must be selected in allowed_roles." });
      return;
    }
    updates["allowed_roles"] = roles;
    rolesChanged = true;
  }
  if (req.body["is_creator_only"] !== undefined) {
    updates["is_creator_only"] = req.body["is_creator_only"] === true;
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
  if (!data) { res.status(404).json({ error: "Topic not found" }); return; }

  // Audit log for visibility changes
  if (rolesChanged && prevVisibility) {
    await logTopicVisibility(req.user!.id, topicId, prevVisibility, {
      allowed_roles: (updates["allowed_roles"] as string[] | undefined) ?? prevVisibility.allowed_roles,
      is_creator_only: (updates["is_creator_only"] as boolean | undefined) ?? prevVisibility.is_creator_only,
    });
  }

  // Keep the lectures row in sync whenever telegram_link changes
  if (req.body["telegram_link"] !== undefined) {
    const telegramLink = capText(req.body["telegram_link"], MAX.URL) || null;
    const { data: existingLectures } = await supabase
      .from("lectures")
      .select("id")
      .eq("topic_id", topicId)
      .order("created_at")
      .limit(1);

    if (existingLectures && existingLectures.length > 0) {
      await supabase.from("lectures").update({ telegram_link: telegramLink }).eq("id", existingLectures[0].id);
    } else {
      await supabase.from("lectures").insert({
        topic_id: topicId,
        telegram_link: telegramLink,
      });
    }
  }

  res.json(data);
});

// ── DELETE /topics/:topicId ───────────────────────────────────────────────────
router.delete("/topics/:topicId", requireAdmin, async (req: AuthRequest, res) => {
  const topicId = req.params["topicId"] as string;
  if (!isValidUuid(topicId)) { res.status(400).json({ error: "Invalid topic ID" }); return; }

  // Clean up orphaned study_tasks rows (no FK constraint — must be handled manually)
  await supabase
    .from("study_tasks")
    .delete()
    .eq("target_type", "platform_subtopic")
    .eq("target_id", topicId);

  // Clean up orphaned content_access_grants rows (no FK constraint — must be handled manually)
  await supabase
    .from("content_access_grants")
    .delete()
    .eq("content_type", "topic")
    .eq("content_id", topicId);

  const { error } = await supabase
    .from("topics")
    .delete()
    .eq("id", topicId);
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Audit log
  await supabase.from("audit_logs").insert({
    actor_id: req.user!.id,
    action: "topic_deleted",
    target_type: "topic",
    target_id: topicId,
  });

  res.json({ message: "Deleted" });
});

// ── POST /topics/reorder ─────────────────────────────────────────────────────
router.post("/topics/reorder", requireAdmin, async (req: AuthRequest, res) => {
  const { topics } = req.body as { topics?: Array<{ id: string; order_index: number }> };
  if (!Array.isArray(topics) || topics.length === 0) {
    res.status(400).json({ error: "topics array required" });
    return;
  }

  // Validate all IDs are UUIDs and order_index values are numbers
  const validTopics = topics.filter(t => isValidUuid(t.id) && Number.isFinite(Number(t.order_index)));
  if (validTopics.length === 0) {
    res.status(400).json({ error: "No valid topics to reorder" });
    return;
  }

  await Promise.all(
    validTopics.map(t =>
      supabase.from("topics").update({ order_index: Math.floor(Number(t.order_index)) }).eq("id", t.id)
    )
  );
  res.json({ message: "Reordered" });
});

export default router;
