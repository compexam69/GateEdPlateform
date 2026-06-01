import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { isValidUuid, capText, MAX } from "../lib/sanitize";

const router = Router();

const VALID_ROLES = ["student", "admin", "super_admin"];

// ── Audit helper ─────────────────────────────────────────────────────────────
async function logSubjectVisibility(
  actorId: string,
  subjectId: string,
  prev: { visibility_roles: string[]; is_creator_only: boolean },
  next: { visibility_roles: string[]; is_creator_only: boolean },
) {
  await supabase.from("audit_logs").insert({
    user_id: actorId,
    action: "subject_visibility_updated",
    resource_type: "subject",
    resource_id: subjectId,
    metadata: {
      prev_visibility_roles: prev.visibility_roles,
      new_visibility_roles: next.visibility_roles,
      prev_is_creator_only: prev.is_creator_only,
      new_is_creator_only: next.is_creator_only,
    },
  });
}

// ── Subject access helper ─────────────────────────────────────────────────────
// Returns true if the calling user is allowed to see a given subject row.
function subjectIsVisible(
  subject: { creator_id: string | null; is_creator_only: boolean; visibility_roles: string[] },
  userId: string,
  role: string,
): boolean {
  if (role === "super_admin") {
    if (subject.creator_id === userId) return true;
    if (!subject.is_creator_only && (subject.visibility_roles ?? []).includes("super_admin")) return true;
    return false; // explicit grants handled separately in list route
  }
  if (role === "admin") {
    return !subject.is_creator_only && (subject.visibility_roles ?? []).includes("admin");
  }
  // student
  return !subject.is_creator_only && (subject.visibility_roles ?? []).includes("student");
}

// ── GET /subjects ─────────────────────────────────────────────────────────────
// Returns subjects visible to the calling user based on their role.
router.get("/subjects", requireAuth, async (req: AuthRequest, res) => {
  const role = req.user!.role;
  const userId = req.user!.id;

  let query = supabase
    .from("subjects")
    .select("id, title, description, icon_url, order_index, is_active, creator_id, visibility_roles, is_creator_only, created_at, updated_at")
    .eq("is_active", true)
    .order("order_index");

  if (role === "student" || role === "admin") {
    query = (query as typeof query)
      .eq("is_creator_only", false)
      .filter("visibility_roles", "cs", `{${role}}`);
  } else if (role === "super_admin") {
    // Fetch subjects explicitly granted to this SA
    const { data: grants } = await supabase
      .from("content_access_grants")
      .select("content_id")
      .eq("granted_to", userId)
      .eq("content_type", "subject");
    const grantedIds = (grants ?? []).map((g) => g.content_id as string);

    const orParts: string[] = [
      `creator_id.eq.${userId}`,
      `and(is_creator_only.eq.false,visibility_roles.cs.{super_admin})`,
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

// ── POST /subjects ────────────────────────────────────────────────────────────
router.post("/subjects", requireAdmin, async (req: AuthRequest, res) => {
  const title = capText(req.body["title"], MAX.TITLE);
  if (!title) { res.status(400).json({ error: "title required" }); return; }

  const description = capText(req.body["description"], MAX.DESCRIPTION);
  const icon_url = capText(req.body["icon_url"], MAX.URL);
  const order_index = req.body["order_index"] != null ? Math.floor(Number(req.body["order_index"])) : 0;
  const is_active = req.body["is_active"] !== false;
  const is_creator_only = req.body["is_creator_only"] === true;

  const roles: string[] = Array.isArray(req.body["visibility_roles"])
    ? (req.body["visibility_roles"] as unknown[]).filter((r: unknown) => VALID_ROLES.includes(r as string)) as string[]
    : VALID_ROLES;

  if (!is_creator_only && roles.length === 0) {
    res.status(400).json({ error: "At least one role must be selected in visibility_roles." });
    return;
  }

  const { data, error } = await supabase
    .from("subjects")
    .insert({
      title,
      description,
      order_index,
      icon_url,
      is_active,
      creator_id: req.user!.id,
      visibility_roles: is_creator_only ? ["super_admin"] : roles,
      is_creator_only,
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

// ── GET /subjects/:subjectId ──────────────────────────────────────────────────
router.get("/subjects/:subjectId", requireAuth, async (req: AuthRequest, res) => {
  const subjectId = req.params["subjectId"] as string;
  if (!isValidUuid(subjectId)) { res.status(400).json({ error: "Invalid subject ID" }); return; }

  const role = req.user!.role;
  const userId = req.user!.id;

  const { data, error } = await supabase
    .from("subjects")
    .select("id, title, description, icon_url, order_index, is_active, creator_id, visibility_roles, is_creator_only, created_at, updated_at")
    .eq("id", subjectId)
    .single();
  if (error || !data) { res.status(404).json({ error: "Not found" }); return; }

  // Access check for non-super-admins is straightforward via helper.
  // For super_admins, also check explicit grants.
  let allowed = subjectIsVisible(data, userId, role);
  if (!allowed && role === "super_admin") {
    const { data: grant } = await supabase
      .from("content_access_grants")
      .select("id")
      .eq("content_type", "subject")
      .eq("content_id", data.id)
      .eq("granted_to", userId)
      .maybeSingle();
    allowed = !!grant;
  }

  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(data);
});

// ── PATCH /subjects/:subjectId ────────────────────────────────────────────────
router.patch("/subjects/:subjectId", requireAdmin, async (req: AuthRequest, res) => {
  const subjectId = req.params["subjectId"] as string;
  if (!isValidUuid(subjectId)) { res.status(400).json({ error: "Invalid subject ID" }); return; }

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
  if (req.body["icon_url"] !== undefined) updates["icon_url"] = capText(req.body["icon_url"], MAX.URL);
  if (req.body["is_active"] !== undefined) updates["is_active"] = Boolean(req.body["is_active"]);

  let visibilityChanged = false;
  if (req.body["visibility_roles"] !== undefined || req.body["is_creator_only"] !== undefined) {
    const roles: string[] = Array.isArray(req.body["visibility_roles"])
      ? (req.body["visibility_roles"] as unknown[]).filter((r: unknown) => VALID_ROLES.includes(r as string)) as string[]
      : [];
    const creatorOnly = req.body["is_creator_only"] === true;
    if (!creatorOnly && req.body["visibility_roles"] !== undefined && roles.length === 0) {
      res.status(400).json({ error: "At least one role must be selected in visibility_roles." });
      return;
    }
    if (req.body["visibility_roles"] !== undefined) {
      updates["visibility_roles"] = creatorOnly ? ["super_admin"] : roles;
    }
    if (req.body["is_creator_only"] !== undefined) updates["is_creator_only"] = creatorOnly;
    visibilityChanged = true;
  }

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }

  // Fetch current state for diff logging
  let prevVisibility: { visibility_roles: string[]; is_creator_only: boolean } | null = null;
  if (visibilityChanged) {
    const { data: current } = await supabase
      .from("subjects")
      .select("visibility_roles, is_creator_only")
      .eq("id", subjectId)
      .single();
    if (current) prevVisibility = current as { visibility_roles: string[]; is_creator_only: boolean };
  }

  const { data, error } = await supabase
    .from("subjects")
    .update(updates)
    .eq("id", subjectId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data) { res.status(404).json({ error: "Subject not found" }); return; }

  if (visibilityChanged && prevVisibility) {
    await logSubjectVisibility(req.user!.id, subjectId, prevVisibility, {
      visibility_roles: (updates["visibility_roles"] as string[] | undefined) ?? prevVisibility.visibility_roles,
      is_creator_only: (updates["is_creator_only"] as boolean | undefined) ?? prevVisibility.is_creator_only,
    });
  }

  res.json(data);
});

// ── POST /subjects/reorder ────────────────────────────────────────────────────
router.post("/subjects/reorder", requireAdmin, async (req: AuthRequest, res) => {
  const { subjects } = req.body as { subjects?: Array<{ id: string; order_index: number }> };
  if (!Array.isArray(subjects) || subjects.length === 0) {
    res.status(400).json({ error: "subjects array required" });
    return;
  }

  // Validate all IDs are UUIDs and order_index values are numbers
  const validSubjects = subjects.filter(s => isValidUuid(s.id) && Number.isFinite(Number(s.order_index)));
  if (validSubjects.length === 0) {
    res.status(400).json({ error: "No valid subjects to reorder" });
    return;
  }

  await Promise.all(
    validSubjects.map(s =>
      supabase.from("subjects").update({ order_index: Math.floor(Number(s.order_index)) }).eq("id", s.id)
    )
  );
  res.json({ message: "Reordered" });
});

// ── DELETE /subjects/:subjectId ───────────────────────────────────────────────
router.delete("/subjects/:subjectId", requireAdmin, async (req: AuthRequest, res) => {
  const subjectId = req.params["subjectId"] as string;
  if (!isValidUuid(subjectId)) { res.status(400).json({ error: "Invalid subject ID" }); return; }

  const { error } = await supabase
    .from("subjects")
    .delete()
    .eq("id", subjectId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Deleted" });
});

export default router;
