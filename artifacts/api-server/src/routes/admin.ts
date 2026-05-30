import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";

const router = Router();

async function writeAuditLog(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  newValue?: Record<string, unknown>,
  oldValue?: Record<string, unknown>
) {
  try {
    await supabase.from("audit_logs").insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      new_value: newValue ?? null,
      old_value: oldValue ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // audit log writes are best-effort
  }
}

/**
 * Role hierarchy: super_admin > admin > student
 * Returns true if the actor is permitted to edit the target's profile fields.
 *   super_admin → can edit student, admin (and other super_admin)
 *   admin       → can edit student ONLY
 *   student     → cannot edit anyone
 */
function canActorEditTarget(actorRole: string, targetRole: string): boolean {
  if (actorRole === "super_admin") return true;
  if (actorRole === "admin") return targetRole === "student";
  return false;
}

/**
 * Fields that are stripped from super_admin rows when the requesting actor
 * is an admin (not a super_admin). Only id, full_name, role, status, and
 * is_approved remain visible.
 */
const SUPER_ADMIN_MASKED_FIELDS = ["email", "mobile_number", "created_at", "avatar_url", "email_verified"];

function maskSuperAdminRow(row: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...row };
  for (const field of SUPER_ADMIN_MASKED_FIELDS) {
    masked[field] = null;
  }
  return masked;
}

router.get("/admin/users", requireAdmin, async (req: AuthRequest, res) => {
  const actorRole = req.user!.role;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }

  const users = (data ?? []) as Record<string, unknown>[];

  // Admins (non-super_admin) must not see sensitive fields of super_admin accounts.
  if (actorRole !== "super_admin") {
    res.json(users.map(u => u["role"] === "super_admin" ? maskSuperAdminRow(u) : u));
    return;
  }

  res.json(users);
});

router.post("/admin/users/:userId/approve", requireAdmin, async (req: AuthRequest, res) => {
  const userId = String(req.params["userId"]);
  const { error } = await supabase
    .from("profiles")
    .update({ is_approved: true, status: "active" })
    .eq("id", userId);
  if (error) { res.status(500).json({ error: error.message }); return; }

  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { is_approved: true, status: "active" },
  });

  // Fetch user profile for email
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  // Notification + audit log + email + push (best-effort)
  await Promise.allSettled([
    supabase.from("notifications").insert({
      user_id: userId,
      title: "Account Approved",
      message: "Your account has been approved. You can now access all study materials.",
      type: "approval",
      is_read: false,
      created_at: new Date().toISOString(),
    }),
    writeAuditLog(req.user!.id, "user_approved", "profile", userId, { status: "active" }),
    sendPushToUser(userId, {
      title: "Account Approved",
      body: "Your account has been approved. Start your learning journey now!",
      url: "/dashboard",
      tag: "account-approved",
    }),
  ]);

  res.json({ message: "User approved" });
});

router.post("/admin/users/:userId/reject", requireAdmin, async (req: AuthRequest, res) => {
  const userId = String(req.params["userId"]);
  const { error } = await supabase
    .from("profiles")
    .update({ is_approved: false, status: "suspended" })
    .eq("id", userId);
  if (error) { res.status(500).json({ error: error.message }); return; }

  await writeAuditLog(req.user!.id, "user_rejected", "profile", userId, { status: "suspended" });
  res.json({ message: "User rejected/banned" });
});

// ── Admin: edit a user's profile fields (name, mobile, email) ────────────────
router.patch("/admin/users/:userId/profile", requireAdmin, async (req: AuthRequest, res) => {
  const targetUserId = String(req.params["userId"]);
  const actorId = req.user!.id;

  // Fetch actor's role from DB first (authoritative source, not JWT metadata)
  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", actorId)
    .maybeSingle();

  const actorRole = actorProfile?.role ?? "";

  // Self-edit via the admin route is only permitted for super_admin.
  // Admins and students must use their own Profile page (which is also blocked
  // for them — this defence-in-depth catch rejects any direct API attempt).
  if (targetUserId === actorId && actorRole !== "super_admin") {
    res.status(403).json({ error: "Admins and students cannot edit their own protected fields." });
    return;
  }

  // Fetch target profile for hierarchy check + snapshot
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("role, full_name, mobile_number, email")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!targetProfile) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  if (!canActorEditTarget(actorRole, targetProfile.role)) {
    res.status(403).json({
      error: actorRole === "admin"
        ? "Admins can only edit student accounts. Editing admin or super admin profiles requires super admin privileges."
        : "Insufficient privileges to edit this user.",
    });
    return;
  }

  const { full_name, mobile_number, email } = req.body as {
    full_name?: string;
    mobile_number?: string;
    email?: string;
  };

  // Only super_admin can change email (requires Supabase Auth operation)
  if (email !== undefined && actorRole !== "super_admin") {
    res.status(403).json({ error: "Only super admins can change a user's email address." });
    return;
  }

  // Build update payload — only include fields that were provided
  const profileUpdates: Record<string, string> = {};
  if (full_name !== undefined && full_name.trim()) profileUpdates["full_name"] = full_name.trim();
  if (mobile_number !== undefined) profileUpdates["mobile_number"] = mobile_number.trim();

  if (Object.keys(profileUpdates).length === 0 && email === undefined) {
    res.status(400).json({ error: "No valid fields provided for update." });
    return;
  }

  // Snapshot old values for audit trail
  const oldSnapshot: Record<string, unknown> = {
    full_name: targetProfile.full_name,
    mobile_number: targetProfile.mobile_number,
    email: targetProfile.email,
  };
  const newSnapshot: Record<string, unknown> = { ...profileUpdates };

  // Apply profile table update
  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", targetUserId);
    if (profileError) { res.status(500).json({ error: profileError.message }); return; }
  }

  // Apply email change via Supabase Auth admin API (super_admin only)
  if (email !== undefined) {
    const cleanEmail = email.toLowerCase().trim();
    const { error: emailError } = await supabase.auth.admin.updateUserById(targetUserId, {
      email: cleanEmail,
    });
    if (emailError) { res.status(400).json({ error: emailError.message }); return; }

    // Sync email into profiles table
    await supabase.from("profiles").update({ email: cleanEmail }).eq("id", targetUserId);
    newSnapshot["email"] = cleanEmail;
  }

  // Sync name/mobile into auth user_metadata for consistency
  if (full_name !== undefined || mobile_number !== undefined) {
    const metaUpdate: Record<string, string> = {};
    if (full_name !== undefined) metaUpdate["full_name"] = full_name.trim();
    if (mobile_number !== undefined) metaUpdate["mobile_number"] = mobile_number.trim();
    await supabase.auth.admin.updateUserById(targetUserId, { user_metadata: metaUpdate });
  }

  await writeAuditLog(
    actorId,
    "profile_edited",
    "profile",
    targetUserId,
    newSnapshot,
    oldSnapshot
  );

  res.json({ message: "Profile updated successfully." });
});

router.patch("/admin/users/:userId/role", requireAdmin, async (req: AuthRequest, res) => {
  const targetUserId = String(req.params["userId"]);
  const actorId = req.user!.id;
  const { role } = req.body as { role?: string };

  const VALID_ROLES = ["student", "admin", "super_admin"];
  if (!role || !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
    return;
  }

  if (targetUserId === actorId) {
    res.status(403).json({ error: "You cannot change your own role." });
    return;
  }

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", actorId)
    .maybeSingle();

  if (actorProfile?.role !== "super_admin") {
    res.status(403).json({ error: "Only super admins can change user roles." });
    return;
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!targetProfile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Sole super_admin protection: cannot demote the last super_admin
  if (targetProfile.role === "super_admin" && role !== "super_admin") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) <= 1) {
      res.status(403).json({ error: "Cannot demote the sole super admin. Promote another user first." });
      return;
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", targetUserId);
  if (error) { res.status(500).json({ error: error.message }); return; }

  await supabase.auth.admin.updateUserById(targetUserId, {
    user_metadata: { role },
  });

  await writeAuditLog(actorId, "role_changed", "profile", targetUserId, {
    from_role: targetProfile.role,
    to_role: role,
    target_name: targetProfile.full_name,
  });

  res.json({ message: `Role updated to ${role}`, user_id: targetUserId, role });
});

router.post("/admin/users/:userId/reset-progress", requireAdmin, async (req: AuthRequest, res) => {
  const { scope, reference_id } = req.body as { scope: string; reference_id?: string };
  const userId = String(req.params["userId"]);

  if (scope === "all") {
    await supabase.from("user_topic_progress").delete().eq("user_id", userId);
    await supabase.from("user_chapter_progress").delete().eq("user_id", userId);
    await supabase.from("user_subject_progress").delete().eq("user_id", userId);
  } else if (scope === "topic" && reference_id) {
    await supabase.from("user_topic_progress").delete().eq("user_id", userId).eq("topic_id", reference_id);
  } else if (scope === "chapter" && reference_id) {
    await supabase.from("user_chapter_progress").delete().eq("user_id", userId).eq("chapter_id", reference_id);
  } else if (scope === "subject" && reference_id) {
    await supabase.from("user_subject_progress").delete().eq("user_id", userId).eq("subject_id", reference_id);
  }

  await writeAuditLog(req.user!.id, "progress_reset", "profile", userId, { scope, reference_id });
  res.json({ message: "Progress reset" });
});

router.get("/admin/analytics", requireAdmin, async (req: AuthRequest, res) => {
  const [studentsRes, pendingRes, attemptsRes, activeRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact" }).eq("role", "student"),
    supabase.from("profiles").select("id", { count: "exact" }).eq("status", "pending_approval"),
    supabase.from("user_attempts").select("accuracy").eq("status", "submitted"),
    supabase.from("pomodoro_sessions").select("user_id").gte("start_time", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const totalStudents = studentsRes.count ?? 0;
  const pendingApprovals = pendingRes.count ?? 0;
  const attempts = attemptsRes.data ?? [];
  const avgAccuracy = attempts.length > 0
    ? attempts.reduce((s: number, a: { accuracy: number }) => s + a.accuracy, 0) / attempts.length
    : 0;
  const activeToday = new Set((activeRes.data ?? []).map((s: { user_id: string }) => s.user_id)).size;

  res.json({
    total_students: totalStudents,
    pending_approvals: pendingApprovals,
    active_today: activeToday,
    total_exams_taken: attempts.length,
    average_accuracy: Math.round(avgAccuracy * 100) / 100,
    low_ctr_lectures: 0,
  });
});

router.get("/admin/storage", requireAdmin, async (req: AuthRequest, res) => {
  const { data: notes } = await supabase.from("user_notes").select("user_id, pdf_size_bytes");
  const allNotes = notes ?? [];
  const totalBytes = allNotes.reduce((s: number, n: { pdf_size_bytes: number }) => s + (n.pdf_size_bytes ?? 0), 0);
  const GLOBAL_LIMIT = 10 * 1024 * 1024 * 1024;
  const ALERT_THRESHOLD = 9.5 * 1024 * 1024 * 1024;

  const userMap = new Map<string, number>();
  for (const n of allNotes as { user_id: string; pdf_size_bytes: number }[]) {
    userMap.set(n.user_id, (userMap.get(n.user_id) ?? 0) + (n.pdf_size_bytes ?? 0));
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("id", userMap.size > 0 ? Array.from(userMap.keys()) : ["00000000-0000-0000-0000-000000000000"]);

  const profileMap = new Map((profiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));

  const topUsers = Array.from(userMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([uid, bytes]) => ({ user_id: uid, full_name: profileMap.get(uid) ?? "Unknown", used_bytes: bytes }));

  // Fire storage alert push + email to all admins if above threshold (best-effort, fire-and-forget)
  if (totalBytes >= ALERT_THRESHOLD) {
    const usedGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(1);
    const limitGB = (GLOBAL_LIMIT / (1024 * 1024 * 1024)).toFixed(0);
    const alertBody = `Platform storage is at ${usedGB}GB of ${limitGB}GB (${Math.round((totalBytes / GLOBAL_LIMIT) * 100)}%).`;
    const alertTitle = "Critical: Storage Almost Full";

    void (async () => {
      try {
        const { data: admins } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("role", ["admin", "super_admin"]);
        if (!admins) return;
        for (const admin of admins as { id: string; email: string; full_name: string }[]) {
          try { await sendPushToUser(admin.id, { title: alertTitle, body: alertBody, url: "/admin/storage", tag: "storage-alert" }); } catch { /* best-effort */ }
        }
      } catch { /* best-effort */ }
    })();
  }

  res.json({
    total_used_bytes: totalBytes,
    limit_bytes: GLOBAL_LIMIT,
    used_percentage: (totalBytes / GLOBAL_LIMIT) * 100,
    total_files: allNotes.length,
    top_users: topUsers,
  });
});

// Gate configuration (system_config table)
const GATE_CONFIG_KEYS = [
  "lecture_quiz_passing_score",
  "topic_test_passing_score",
  "chapter_test_passing_score",
  "subject_test_passing_score",
  "max_quiz_attempts",
  "max_exam_pauses",
  "exam_timeout_warning_mins",
  "per_user_storage_limit_mb",
  "global_storage_limit_gb",
  "require_email_verification",
];

router.get("/admin/gate-config", requireAdmin, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("system_config")
    .select("key, value")
    .in("key", GATE_CONFIG_KEYS);

  if (error) {
    // Return defaults if table doesn't exist
    if (error.code === "42P01") {
      res.json({
        lecture_quiz_passing_score: 60,
        topic_test_passing_score: 70,
        chapter_test_passing_score: 60,
        subject_test_passing_score: 60,
        max_quiz_attempts: 3,
        max_exam_pauses: 2,
        exam_timeout_warning_mins: 5,
        per_user_storage_limit_mb: 500,
        global_storage_limit_gb: 9,
        require_email_verification: true,
      });
      return;
    }
    res.status(500).json({ error: error.message });
    return;
  }

  const config: Record<string, unknown> = {};
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    config[row.key] = row.value;
  }
  res.json(config);
});

router.patch("/admin/gate-config", requireAdmin, async (req: AuthRequest, res) => {
  const updates = req.body as Record<string, unknown>;
  const adminId = req.user!.id;

  const upserts = Object.entries(updates)
    .filter(([key]) => GATE_CONFIG_KEYS.includes(key))
    .map(([key, value]) => ({
      key,
      value: value,
      updated_at: new Date().toISOString(),
      updated_by: adminId,
    }));

  if (upserts.length === 0) {
    res.status(400).json({ error: "No valid config keys provided" });
    return;
  }

  const { error } = await supabase
    .from("system_config")
    .upsert(upserts, { onConflict: "key" });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Config updated", updated: upserts.map(u => u.key) });
});

router.get("/admin/users/:userId/detail", requireAdmin, async (req: AuthRequest, res) => {
  const userId = String(req.params["userId"]);
  const actorRole = req.user!.role;

  // Before fetching activity data, check target role to block admin from viewing super_admin detail.
  if (actorRole !== "super_admin") {
    const { data: targetCheck } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (targetCheck?.role === "super_admin") {
      res.status(403).json({ error: "Admins cannot view detailed profiles of super admin accounts." });
      return;
    }
  }

  const [profileRes, attemptsRes, notesRes, pomodoroRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_attempts")
      .select("id, score, total_marks, accuracy, status, started_at, submitted_at, quizzes(title, type)")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("user_notes")
      .select("id, title, chapter_id, pdf_size_bytes, created_at, chapters(title)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("pomodoro_sessions")
      .select("id, duration_seconds, topic_context, start_time")
      .eq("user_id", userId)
      .order("start_time", { ascending: false })
      .limit(10),
  ]);

  if (!profileRes.data) { res.status(404).json({ error: "User not found" }); return; }

  const totalNotesBytes = (notesRes.data ?? []).reduce(
    (s: number, n: { pdf_size_bytes: number }) => s + (n.pdf_size_bytes ?? 0), 0
  );
  const totalPomodoro = (pomodoroRes.data ?? []).reduce(
    (s: number, p: { duration_seconds: number }) => s + (p.duration_seconds ?? 0), 0
  );

  res.json({
    profile: profileRes.data,
    attempts: attemptsRes.data ?? [],
    notes: notesRes.data ?? [],
    pomodoro_sessions: pomodoroRes.data ?? [],
    stats: {
      total_attempts: (attemptsRes.data ?? []).length,
      total_notes: (notesRes.data ?? []).length,
      total_notes_bytes: totalNotesBytes,
      total_pomodoro_seconds: totalPomodoro,
    },
  });
});

// Send study reminders to students who have no pomodoro session today
router.post("/admin/study-reminders", requireAdmin, async (_req: AuthRequest, res) => {
  const { data: students } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "student")
    .eq("status", "active");

  if (!students || students.length === 0) {
    res.json({ sent: 0, skipped: 0, message: "No active students" });
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { data: studiedToday } = await supabase
    .from("pomodoro_sessions")
    .select("user_id")
    .gte("start_time", todayStart.toISOString())
    .lte("start_time", todayEnd.toISOString());

  const studiedSet = new Set((studiedToday ?? []).map((s: { user_id: string }) => s.user_id));
  const toRemind = students.filter(s => !studiedSet.has(s.id));

  let sent = 0;
  for (const student of toRemind) {
    try {
      await sendPushToUser(student.id, {
        title: "Time to Study!",
        body: "You haven't studied today yet. Keep your streak going!",
        url: "/dashboard",
        tag: "study-reminder",
      });
      sent++;
    } catch { /* best-effort */ }
  }

  res.json({ sent, skipped: students.length - toRemind.length, total_students: students.length });
});

router.get("/admin/lecture-ctr", requireAdmin, async (_req: AuthRequest, res) => {
  const { data: clicks, error } = await supabase
    .from("lecture_clicks")
    .select("user_id, lecture_id, lectures!inner(topic_id, topics!inner(id, title))");

  if (error) { res.status(500).json({ error: error.message }); return; }

  const topicMap = new Map<string, { title: string; clicks: number; uniqueUsers: Set<string> }>();

  for (const row of (clicks ?? []) as unknown as Array<{
    user_id: string;
    lecture_id: string;
    lectures: { topic_id: string; topics: { id: string; title: string } };
  }>) {
    const topic = row.lectures?.topics;
    if (!topic) continue;
    const topicId = topic.id;
    if (!topicMap.has(topicId)) topicMap.set(topicId, { title: topic.title, clicks: 0, uniqueUsers: new Set() });
    const entry = topicMap.get(topicId)!;
    entry.clicks++;
    entry.uniqueUsers.add(row.user_id);
  }

  const result = Array.from(topicMap.entries())
    .map(([id, v]) => ({ topic_id: id, title: v.title, total_clicks: v.clicks, unique_users: v.uniqueUsers.size }))
    .sort((a, b) => b.total_clicks - a.total_clicks)
    .slice(0, 50);

  res.json(result);
});

// ── Admin: create single user ────────────────────────────────────────────────
router.post("/admin/users/create", requireAdmin, async (req: AuthRequest, res) => {
  const { full_name, email, password, role, mobile_number, status } = req.body as {
    full_name?: string;
    email?: string;
    password?: string;
    role?: string;
    mobile_number?: string;
    status?: string;
  };

  if (!full_name || !email || !password) {
    res.status(400).json({ error: "full_name, email, and password are required." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  const VALID_ROLES = ["student", "admin", "super_admin"];
  const userRole = role && VALID_ROLES.includes(role) ? role : "student";
  const userStatus = status === "pending_approval" ? "pending_approval" : "active";
  const isApproved = userStatus === "active";

  const { data, error } = await supabase.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
    user_metadata: {
      full_name: full_name.trim(),
      mobile_number: mobile_number ?? null,
      role: userRole,
    },
  });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (data.user) {
    await supabase
      .from("profiles")
      .update({ role: userRole, is_approved: isApproved, status: userStatus })
      .eq("id", data.user.id);

    await writeAuditLog(req.user!.id, "user_created", "profile", data.user.id, {
      full_name: full_name.trim(),
      email: email.toLowerCase().trim(),
      role: userRole,
      status: userStatus,
    });
  }

  res.status(201).json({ message: "User created", user_id: data.user?.id });
});

// ── Admin: bulk import users (CSV/JSON) ───────────────────────────────────────
router.post("/admin/users/bulk-import", requireAdmin, async (req: AuthRequest, res) => {
  const { users } = req.body as {
    users?: Array<{
      full_name: string;
      email: string;
      password: string;
      role?: string;
      mobile_number?: string;
      status?: string;
    }>;
  };

  if (!Array.isArray(users) || users.length === 0) {
    res.status(400).json({ error: "users array is required and must not be empty." });
    return;
  }
  if (users.length > 500) {
    res.status(400).json({ error: "Maximum 500 users per import." });
    return;
  }

  const VALID_ROLES = ["student", "admin", "super_admin"];
  const createdIds: string[] = [];
  const errors: Array<{ email: string; error: string }> = [];

  for (const u of users) {
    if (!u.full_name || !u.email || !u.password) {
      errors.push({ email: u.email ?? "unknown", error: "full_name, email, and password are required." });
      continue;
    }
    if (u.password.length < 8) {
      errors.push({ email: u.email, error: "Password must be at least 8 characters." });
      continue;
    }

    const userRole = u.role && VALID_ROLES.includes(u.role) ? u.role : "student";
    const userStatus = u.status === "pending_approval" ? "pending_approval" : "active";
    const isApproved = userStatus === "active";

    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email.toLowerCase().trim(),
        password: u.password,
        email_confirm: true,
        user_metadata: {
          full_name: u.full_name.trim(),
          mobile_number: u.mobile_number ?? null,
          role: userRole,
        },
      });

      if (error) {
        errors.push({ email: u.email, error: error.message });
        continue;
      }

      if (data.user) {
        await supabase
          .from("profiles")
          .update({ role: userRole, is_approved: isApproved, status: userStatus })
          .eq("id", data.user.id);
        createdIds.push(data.user.id);
      }
    } catch (err) {
      errors.push({ email: u.email, error: String(err) });
    }
  }

  await writeAuditLog(req.user!.id, "bulk_user_import", "profile", "bulk", {
    created: createdIds.length,
    failed: errors.length,
  });

  res.json({
    message: `Import complete: ${createdIds.length} created, ${errors.length} failed.`,
    created: createdIds.length,
    failed: errors.length,
    errors,
  });
});

// ── Admin: bulk import subjects (CSV/JSON) ────────────────────────────────────
router.post("/admin/subjects/bulk-import", requireAdmin, async (req: AuthRequest, res) => {
  const { subjects } = req.body as {
    subjects?: Array<{ title: string; description?: string; order_index?: number }>;
  };

  if (!Array.isArray(subjects) || subjects.length === 0) {
    res.status(400).json({ error: "subjects array is required and must not be empty." });
    return;
  }
  if (subjects.length > 500) {
    res.status(400).json({ error: "Maximum 500 subjects per import." });
    return;
  }

  const { data: existing } = await supabase
    .from("subjects")
    .select("title")
    .eq("is_active", true);
  const existingTitles = new Set(
    (existing ?? []).map((s: { title: string }) => s.title.toLowerCase().trim())
  );

  const rows: Array<Record<string, unknown>> = [];
  const errors: Array<{ subject_name: string; error: string }> = [];
  const seenInBatch = new Set<string>();
  let duplicateCount = 0;

  for (let i = 0; i < subjects.length; i++) {
    const s = subjects[i];
    const rowNum = i + 2; // row 1 = CSV header

    if (!s.title?.trim()) {
      errors.push({ subject_name: "", error: `Row ${rowNum}: Subject Name is required.` });
      continue;
    }

    const key = s.title.trim().toLowerCase();

    if (existingTitles.has(key)) {
      duplicateCount++;
      errors.push({ subject_name: s.title.trim(), error: `Row ${rowNum}: "${s.title.trim()}" already exists — skipped.` });
      continue;
    }

    if (seenInBatch.has(key)) {
      errors.push({ subject_name: s.title.trim(), error: `Row ${rowNum}: "${s.title.trim()}" appears more than once in this import — skipped.` });
      continue;
    }

    seenInBatch.add(key);
    rows.push({
      title: s.title.trim(),
      description: s.description?.trim() || null,
      order_index: typeof s.order_index === "number" && !isNaN(s.order_index) ? s.order_index : rows.length + 1,
      is_active: true,
      visibility_roles: ["student", "admin", "super_admin"],
      is_creator_only: false,
      creator_id: req.user!.id,
    });
  }

  if (rows.length === 0) {
    res.status(422).json({
      error: duplicateCount === subjects.length
        ? "All subjects already exist in the database."
        : "No valid subjects to import.",
      errors,
      imported: 0,
      duplicates: duplicateCount,
      failed: errors.length - duplicateCount,
    });
    return;
  }

  const { error: insertErr } = await supabase.from("subjects").insert(rows);
  if (insertErr) {
    res.status(500).json({ error: `Database insert failed: ${insertErr.message}`, errors });
    return;
  }

  await writeAuditLog(req.user!.id, "bulk_subject_import", "subject", "bulk", {
    imported: rows.length,
    duplicates: duplicateCount,
    failed: errors.length - duplicateCount,
  });

  res.json({
    message: `Import complete: ${rows.length} created, ${duplicateCount} duplicate${duplicateCount !== 1 ? "s" : ""} skipped.`,
    imported: rows.length,
    duplicates: duplicateCount,
    failed: errors.length - duplicateCount,
    errors,
  });
});

// ── Bulk chapter import ───────────────────────────────────────────────────────
router.post("/admin/chapters/bulk-import", requireAdmin, async (req: AuthRequest, res) => {
  const { chapters } = req.body as {
    chapters?: Array<{ subject_name?: string; chapter_name?: string; description?: string; display_order?: number }>;
  };

  if (!Array.isArray(chapters) || chapters.length === 0) {
    res.status(400).json({ error: "chapters array is required and must not be empty." });
    return;
  }
  if (chapters.length > 500) {
    res.status(400).json({ error: "Maximum 500 chapters per import." });
    return;
  }

  const { data: existingSubjects } = await supabase.from("subjects").select("id, title").eq("is_active", true);
  const subjectMap = new Map<string, string>();
  (existingSubjects ?? []).forEach((s: { id: string; title: string }) => subjectMap.set(s.title.toLowerCase().trim(), s.id));

  const { data: existingChapters } = await supabase.from("chapters").select("title, subject_id");
  const existingChapterKeys = new Set<string>();
  (existingChapters ?? []).forEach((c: { title: string; subject_id: string }) => {
    existingChapterKeys.add(`${c.subject_id}:${c.title.toLowerCase().trim()}`);
  });

  const rows: Array<Record<string, unknown>> = [];
  const errors: Array<{ row: number; chapter_name: string; error: string }> = [];
  const seenInBatch = new Set<string>();
  let duplicateCount = 0;

  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    const rowNum = i + 2;

    if (!c.subject_name?.trim()) {
      errors.push({ row: rowNum, chapter_name: c.chapter_name ?? "", error: `Row ${rowNum}: Subject Name is required.` });
      continue;
    }
    if (!c.chapter_name?.trim()) {
      errors.push({ row: rowNum, chapter_name: "", error: `Row ${rowNum}: Chapter Name is required.` });
      continue;
    }

    const subjectId = subjectMap.get(c.subject_name.trim().toLowerCase());
    if (!subjectId) {
      errors.push({ row: rowNum, chapter_name: c.chapter_name.trim(), error: `Row ${rowNum}: Subject "${c.subject_name.trim()}" not found. Create the subject first or use Full Hierarchy import.` });
      continue;
    }

    const key = `${subjectId}:${c.chapter_name.trim().toLowerCase()}`;

    if (existingChapterKeys.has(key)) {
      duplicateCount++;
      errors.push({ row: rowNum, chapter_name: c.chapter_name.trim(), error: `Row ${rowNum}: Chapter "${c.chapter_name.trim()}" already exists in "${c.subject_name.trim()}" — skipped.` });
      continue;
    }

    if (seenInBatch.has(key)) {
      errors.push({ row: rowNum, chapter_name: c.chapter_name.trim(), error: `Row ${rowNum}: Chapter "${c.chapter_name.trim()}" appears more than once — skipped.` });
      continue;
    }

    seenInBatch.add(key);
    rows.push({
      subject_id: subjectId,
      title: c.chapter_name.trim(),
      description: c.description?.trim() || null,
      order_index: typeof c.display_order === "number" && !isNaN(c.display_order) ? c.display_order : rows.length + 1,
      is_active: true,
    });
  }

  if (rows.length === 0) {
    res.status(422).json({
      error: duplicateCount === chapters.length ? "All chapters already exist." : "No valid chapters to import.",
      errors, imported: 0, duplicates: duplicateCount, failed: errors.length - duplicateCount,
    });
    return;
  }

  const { error: insertErr } = await supabase.from("chapters").insert(rows);
  if (insertErr) {
    res.status(500).json({ error: `Database insert failed: ${insertErr.message}`, errors });
    return;
  }

  await writeAuditLog(req.user!.id, "bulk_chapter_import", "chapter", "bulk", {
    imported: rows.length, duplicates: duplicateCount, failed: errors.length - duplicateCount,
  });

  res.json({
    message: `Import complete: ${rows.length} created, ${duplicateCount} duplicate${duplicateCount !== 1 ? "s" : ""} skipped.`,
    imported: rows.length, duplicates: duplicateCount, failed: errors.length - duplicateCount, errors,
  });
});

// ── Bulk topic import ─────────────────────────────────────────────────────────
router.post("/admin/topics/bulk-import", requireAdmin, async (req: AuthRequest, res) => {
  const { topics } = req.body as {
    topics?: Array<{ subject_name?: string; chapter_name?: string; topic_name?: string; description?: string; display_order?: number; telegram_link?: string }>;
  };

  if (!Array.isArray(topics) || topics.length === 0) {
    res.status(400).json({ error: "topics array is required and must not be empty." });
    return;
  }
  if (topics.length > 1000) {
    res.status(400).json({ error: "Maximum 1000 topics per import." });
    return;
  }

  const { data: existingSubjects } = await supabase.from("subjects").select("id, title").eq("is_active", true);
  const subjectMap = new Map<string, string>();
  (existingSubjects ?? []).forEach((s: { id: string; title: string }) => subjectMap.set(s.title.toLowerCase().trim(), s.id));

  const { data: existingChapters } = await supabase.from("chapters").select("id, title, subject_id");
  const chapterMap = new Map<string, string>();
  (existingChapters ?? []).forEach((c: { id: string; title: string; subject_id: string }) => {
    chapterMap.set(`${c.subject_id}:${c.title.toLowerCase().trim()}`, c.id);
  });

  const { data: existingTopics } = await supabase.from("topics").select("title, chapter_id");
  const existingTopicKeys = new Set<string>();
  (existingTopics ?? []).forEach((t: { title: string; chapter_id: string }) => {
    existingTopicKeys.add(`${t.chapter_id}:${t.title.toLowerCase().trim()}`);
  });

  const rows: Array<Record<string, unknown>> = [];
  const errors: Array<{ row: number; topic_name: string; error: string }> = [];
  const seenInBatch = new Set<string>();
  let duplicateCount = 0;

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    const rowNum = i + 2;

    if (!t.subject_name?.trim()) {
      errors.push({ row: rowNum, topic_name: t.topic_name ?? "", error: `Row ${rowNum}: Subject Name is required.` });
      continue;
    }
    if (!t.chapter_name?.trim()) {
      errors.push({ row: rowNum, topic_name: t.topic_name ?? "", error: `Row ${rowNum}: Chapter Name is required.` });
      continue;
    }
    if (!t.topic_name?.trim()) {
      errors.push({ row: rowNum, topic_name: "", error: `Row ${rowNum}: Topic Name is required.` });
      continue;
    }

    const subjectId = subjectMap.get(t.subject_name.trim().toLowerCase());
    if (!subjectId) {
      errors.push({ row: rowNum, topic_name: t.topic_name.trim(), error: `Row ${rowNum}: Subject "${t.subject_name.trim()}" not found.` });
      continue;
    }

    const chapterId = chapterMap.get(`${subjectId}:${t.chapter_name.trim().toLowerCase()}`);
    if (!chapterId) {
      errors.push({ row: rowNum, topic_name: t.topic_name.trim(), error: `Row ${rowNum}: Chapter "${t.chapter_name.trim()}" not found under Subject "${t.subject_name.trim()}".` });
      continue;
    }

    const topicKey = `${chapterId}:${t.topic_name.trim().toLowerCase()}`;

    if (existingTopicKeys.has(topicKey)) {
      duplicateCount++;
      errors.push({ row: rowNum, topic_name: t.topic_name.trim(), error: `Row ${rowNum}: Topic "${t.topic_name.trim()}" already exists in "${t.chapter_name.trim()}" — skipped.` });
      continue;
    }

    if (seenInBatch.has(topicKey)) {
      errors.push({ row: rowNum, topic_name: t.topic_name.trim(), error: `Row ${rowNum}: Topic "${t.topic_name.trim()}" appears more than once — skipped.` });
      continue;
    }

    seenInBatch.add(topicKey);
    rows.push({
      chapter_id: chapterId,
      title: t.topic_name.trim(),
      description: t.description?.trim() || null,
      order_index: typeof t.display_order === "number" && !isNaN(t.display_order) ? t.display_order : rows.length + 1,
      telegram_link: t.telegram_link?.trim() || null,
      allowed_roles: ["student", "admin", "super_admin"],
      is_creator_only: false,
      is_active: true,
    });
  }

  if (rows.length === 0) {
    res.status(422).json({
      error: duplicateCount === topics.length ? "All topics already exist." : "No valid topics to import.",
      errors, imported: 0, duplicates: duplicateCount, failed: errors.length - duplicateCount,
    });
    return;
  }

  const { error: insertErr } = await supabase.from("topics").insert(rows);
  if (insertErr) {
    res.status(500).json({ error: `Database insert failed: ${insertErr.message}`, errors });
    return;
  }

  await writeAuditLog(req.user!.id, "bulk_topic_import", "topic", "bulk", {
    imported: rows.length, duplicates: duplicateCount, failed: errors.length - duplicateCount,
  });

  res.json({
    message: `Import complete: ${rows.length} created, ${duplicateCount} duplicate${duplicateCount !== 1 ? "s" : ""} skipped.`,
    imported: rows.length, duplicates: duplicateCount, failed: errors.length - duplicateCount, errors,
  });
});

// ── Bulk hierarchy import (auto-creates subjects → chapters → topics) ──────────
router.post("/admin/hierarchy/bulk-import", requireAdmin, async (req: AuthRequest, res) => {
  const { rows: hierarchyRows } = req.body as {
    rows?: Array<{ subject?: string; chapter?: string; topic?: string; description?: string; telegram_link?: string }>;
  };

  if (!Array.isArray(hierarchyRows) || hierarchyRows.length === 0) {
    res.status(400).json({ error: "rows array is required and must not be empty." });
    return;
  }
  if (hierarchyRows.length > 1000) {
    res.status(400).json({ error: "Maximum 1000 rows per import." });
    return;
  }

  const errors: Array<{ row: number; error: string }> = [];
  const validRows: Array<{ subject: string; chapter: string; topic: string; description?: string; telegram_link?: string; rowNum: number }> = [];

  for (let i = 0; i < hierarchyRows.length; i++) {
    const r = hierarchyRows[i];
    const rowNum = i + 2;
    if (!r.subject?.trim() || !r.chapter?.trim() || !r.topic?.trim()) {
      errors.push({ row: rowNum, error: `Row ${rowNum}: Subject, Chapter, and Topic are all required.` });
      continue;
    }
    validRows.push({ subject: r.subject.trim(), chapter: r.chapter.trim(), topic: r.topic.trim(), description: r.description, telegram_link: r.telegram_link, rowNum });
  }

  if (validRows.length === 0) {
    res.status(422).json({ error: "No valid rows to import.", errors, subjects_created: 0, chapters_created: 0, topics_created: 0, topics_skipped: 0 });
    return;
  }

  // ── Step 1: Fetch / upsert subjects ──
  const { data: existingSubjectsData } = await supabase.from("subjects").select("id, title").eq("is_active", true);
  const subjectMap = new Map<string, string>();
  (existingSubjectsData ?? []).forEach((s: { id: string; title: string }) => subjectMap.set(s.title.toLowerCase().trim(), s.id));

  const uniqueSubjectNames = [...new Set(validRows.map(r => r.subject))];
  const newSubjectNames = uniqueSubjectNames.filter(name => !subjectMap.has(name.toLowerCase()));
  let subjectsCreated = 0;

  if (newSubjectNames.length > 0) {
    const { data: created, error: err } = await supabase.from("subjects").insert(
      newSubjectNames.map((name, idx) => ({
        title: name, is_active: true, visibility_roles: ["student", "admin", "super_admin"],
        is_creator_only: false, creator_id: req.user!.id,
        order_index: (existingSubjectsData?.length ?? 0) + idx + 1,
      }))
    ).select("id, title");
    if (err) { res.status(500).json({ error: `Failed to create subjects: ${err.message}` }); return; }
    (created ?? []).forEach((s: { id: string; title: string }) => subjectMap.set(s.title.toLowerCase().trim(), s.id));
    subjectsCreated = newSubjectNames.length;
  }

  // ── Step 2: Fetch / upsert chapters ──
  const { data: existingChaptersData } = await supabase.from("chapters").select("id, title, subject_id");
  const chapterMap = new Map<string, string>();
  (existingChaptersData ?? []).forEach((c: { id: string; title: string; subject_id: string }) => {
    chapterMap.set(`${c.subject_id}:${c.title.toLowerCase().trim()}`, c.id);
  });

  const chapterInserts: Array<{ subject_id: string; title: string; key: string }> = [];
  const seenChapterKeys = new Set<string>();

  for (const r of validRows) {
    const sid = subjectMap.get(r.subject.toLowerCase());
    if (!sid) continue;
    const key = `${sid}:${r.chapter.toLowerCase()}`;
    if (!chapterMap.has(key) && !seenChapterKeys.has(key)) {
      seenChapterKeys.add(key);
      chapterInserts.push({ subject_id: sid, title: r.chapter, key });
    }
  }
  let chaptersCreated = 0;

  if (chapterInserts.length > 0) {
    const { data: created, error: err } = await supabase.from("chapters").insert(
      chapterInserts.map((c, idx) => ({ subject_id: c.subject_id, title: c.title, order_index: idx + 1, is_active: true }))
    ).select("id, title, subject_id");
    if (err) { res.status(500).json({ error: `Failed to create chapters: ${err.message}` }); return; }
    (created ?? []).forEach((c: { id: string; title: string; subject_id: string }) => {
      chapterMap.set(`${c.subject_id}:${c.title.toLowerCase().trim()}`, c.id);
    });
    chaptersCreated = chapterInserts.length;
  }

  // ── Step 3: Fetch existing topics, create new ones ──
  const { data: existingTopicsData } = await supabase.from("topics").select("title, chapter_id");
  const existingTopicKeys = new Set<string>();
  (existingTopicsData ?? []).forEach((t: { title: string; chapter_id: string }) => {
    existingTopicKeys.add(`${t.chapter_id}:${t.title.toLowerCase().trim()}`);
  });

  const topicRows: Array<Record<string, unknown>> = [];
  const seenTopicKeys = new Set<string>();
  let topicsSkipped = 0;

  for (const r of validRows) {
    const sid = subjectMap.get(r.subject.toLowerCase());
    if (!sid) { topicsSkipped++; continue; }
    const cid = chapterMap.get(`${sid}:${r.chapter.toLowerCase()}`);
    if (!cid) { topicsSkipped++; continue; }
    const tKey = `${cid}:${r.topic.toLowerCase()}`;
    if (existingTopicKeys.has(tKey) || seenTopicKeys.has(tKey)) { topicsSkipped++; continue; }
    seenTopicKeys.add(tKey);
    topicRows.push({
      chapter_id: cid, title: r.topic, description: r.description?.trim() || null,
      telegram_link: r.telegram_link?.trim() || null, order_index: topicRows.length + 1,
      allowed_roles: ["student", "admin", "super_admin"], is_creator_only: false, is_active: true,
    });
  }

  if (topicRows.length > 0) {
    const { error: err } = await supabase.from("topics").insert(topicRows);
    if (err) { res.status(500).json({ error: `Failed to create topics: ${err.message}` }); return; }
  }

  await writeAuditLog(req.user!.id, "bulk_hierarchy_import", "hierarchy", "bulk", {
    subjects_created: subjectsCreated, chapters_created: chaptersCreated,
    topics_created: topicRows.length, topics_skipped: topicsSkipped,
  });

  res.json({
    message: "Import complete.",
    subjects_created: subjectsCreated, chapters_created: chaptersCreated,
    topics_created: topicRows.length, topics_skipped: topicsSkipped,
    errors,
  });
});

// ── Bulk quiz import ──────────────────────────────────────────────────────────
router.post("/admin/quizzes/bulk-import", requireAdmin, async (req: AuthRequest, res) => {
  const { quizzes } = req.body as {
    quizzes?: Array<{
      title?: string;
      type?: string;
      passing_score?: number;
      duration_minutes?: number;
      negative_marking?: number;
      max_attempts?: number;
    }>;
  };

  const VALID_TYPES = new Set(["lecture_quiz","dpp","pyq","topic_test","chapter_test","subject_test","grand_test"]);

  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    res.status(400).json({ error: "quizzes array is required and must not be empty." });
    return;
  }
  if (quizzes.length > 200) {
    res.status(400).json({ error: "Maximum 200 quizzes per import." });
    return;
  }

  const rows: Record<string, unknown>[] = [];
  const errors: Array<{ title: string; error: string }> = [];

  for (let i = 0; i < quizzes.length; i++) {
    const q = quizzes[i];
    const rowNum = i + 2;

    if (!q.title?.trim()) {
      errors.push({ title: "", error: `Row ${rowNum}: Title is required.` });
      continue;
    }
    const type = q.type ?? "topic_test";
    if (!VALID_TYPES.has(type)) {
      errors.push({ title: q.title, error: `Row ${rowNum}: Invalid type "${type}". Valid values: ${[...VALID_TYPES].join(", ")}.` });
      continue;
    }

    rows.push({
      title: q.title.trim(),
      type,
      passing_score: Number(q.passing_score ?? 60) || 60,
      duration_minutes: Number(q.duration_minutes ?? 30) || 30,
      negative_marking: Number(q.negative_marking ?? 0),
      max_attempts: Number(q.max_attempts ?? 3) || 3,
      is_active: true,
      allowed_roles: ["student", "admin", "super_admin"],
      creator_id: req.user!.id,
    });
  }

  if (rows.length === 0) {
    res.status(422).json({ error: "No valid quizzes to import.", errors, imported: 0, failed: errors.length });
    return;
  }

  const { error: insertErr } = await supabase.from("quizzes").insert(rows);
  if (insertErr) {
    res.status(500).json({ error: `Database insert failed: ${insertErr.message}`, errors });
    return;
  }

  await writeAuditLog(req.user!.id, "bulk_quiz_import", "quiz", "bulk", {
    imported: rows.length,
    failed: errors.length,
  });

  res.json({
    message: `Import complete: ${rows.length} quiz${rows.length !== 1 ? "zes" : ""} created.`,
    imported: rows.length,
    failed: errors.length,
    errors,
  });
});

// ── Rate-limit monitor ────────────────────────────────────────────────────────
// Maps key prefix → { maxRequests, windowMs, label }
const RATE_LIMIT_RULES: Record<string, { maxRequests: number; windowMs: number; label: string }> = {
  "exam-start":  { maxRequests: 5,  windowMs: 60_000,       label: "Exam start (5/min)"        },
  "register":    { maxRequests: 10, windowMs: 3_600_000,    label: "Registration (10/hr)"       },
  "resend":      { maxRequests: 3,  windowMs: 3_600_000,    label: "Resend verify email (3/hr)" },
  "pwd-change":  { maxRequests: 3,  windowMs: 3_600_000,    label: "Password change (3/hr)"     },
};

router.get("/admin/rate-limits", requireAdmin, async (_req: AuthRequest, res) => {
  // Fetch all rows from the last 2 hours (covers every window we use)
  const windowStart = new Date(Date.now() - 2 * 3_600_000).toISOString();

  const { data, error } = await supabase
    .from("rate_limits")
    .select("key, created_at")
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Group hits by key
  const byKey = new Map<string, string[]>();
  for (const row of (data ?? []) as { key: string; created_at: string }[]) {
    const hits = byKey.get(row.key) ?? [];
    hits.push(row.created_at);
    byKey.set(row.key, hits);
  }

  const now = Date.now();
  const entries = Array.from(byKey.entries()).map(([key, timestamps]) => {
    // Identify which rule applies by matching the key prefix
    const prefix = Object.keys(RATE_LIMIT_RULES).find(p => key.startsWith(p + ":"));
    const rule = prefix ? RATE_LIMIT_RULES[prefix] : null;

    // Count only hits within the applicable window
    const windowMs = rule?.windowMs ?? 3_600_000;
    const windowStart = new Date(now - windowMs).toISOString();
    const hitsInWindow = timestamps.filter(t => t >= windowStart);

    const maxRequests = rule?.maxRequests ?? Infinity;
    const throttled = hitsInWindow.length >= maxRequests;

    // When will the oldest hit in the window drop off (= when the throttle clears)?
    const oldestInWindow = hitsInWindow[hitsInWindow.length - 1] ?? null;
    const resetsAt = oldestInWindow
      ? new Date(new Date(oldestInWindow).getTime() + windowMs).toISOString()
      : null;

    return {
      key,
      type: rule?.label ?? "unknown",
      hits_in_window: hitsInWindow.length,
      limit: rule?.maxRequests ?? null,
      throttled,
      resets_at: throttled ? resetsAt : null,
      last_hit_at: timestamps[0] ?? null,
    };
  });

  // Sort: throttled first, then by hit count descending
  entries.sort((a, b) => {
    if (a.throttled !== b.throttled) return a.throttled ? -1 : 1;
    return b.hits_in_window - a.hits_in_window;
  });

  res.json({ total_keys: entries.length, entries });
});

// ── Content Visibility: update allowed_roles for a quiz ───────────────────────
// - super_admin: can update any quiz
// - admin: can only update quizzes they personally created
router.patch("/admin/content/quizzes/:quizId/visibility", requireAdmin, async (req: AuthRequest, res) => {
  const actorId = req.user!.id;
  const actorRole = req.user!.role;
  const { quizId } = req.params as { quizId: string };
  const { allowed_roles } = req.body as { allowed_roles: string[] };

  const VALID_ROLES = ["student", "admin", "super_admin"];
  if (
    !Array.isArray(allowed_roles) ||
    allowed_roles.length === 0 ||
    !allowed_roles.every(r => VALID_ROLES.includes(r as string))
  ) {
    res.status(400).json({ error: "allowed_roles must be a non-empty array of: student, admin, super_admin" });
    return;
  }

  const { data: quiz, error: fetchErr } = await supabase
    .from("quizzes")
    .select("id, creator_id, title")
    .eq("id", quizId)
    .single();
  if (fetchErr || !quiz) { res.status(404).json({ error: "Quiz not found" }); return; }

  if (actorRole !== "super_admin" && quiz.creator_id !== actorId) {
    res.status(403).json({ error: "You can only update visibility of quizzes you created." });
    return;
  }

  const { data, error } = await supabase
    .from("quizzes")
    .update({ allowed_roles })
    .eq("id", quizId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  await writeAuditLog(actorId, "quiz_visibility_changed", "quiz", quizId, {
    allowed_roles,
    quiz_title: quiz.title,
  });
  res.json(data);
});

// ── Content Access Grants (super_admin only) ──────────────────────────────────
// Explicit SA-to-SA sharing: SA1 can grant SA2 management rights over SA1's content.

router.get("/admin/content/grants", requireAdmin, async (req: AuthRequest, res) => {
  if (req.user!.role !== "super_admin") {
    res.status(403).json({ error: "Only super admins can view content grants." });
    return;
  }
  const { content_type, content_id } = req.query as { content_type?: string; content_id?: string };

  let query = supabase
    .from("content_access_grants")
    .select("id, content_type, content_id, granted_to, granted_by, created_at")
    .order("created_at", { ascending: false });
  if (content_type) query = query.eq("content_type", content_type);
  if (content_id) query = query.eq("content_id", content_id);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/admin/content/grants", requireAdmin, async (req: AuthRequest, res) => {
  const actorId = req.user!.id;
  if (req.user!.role !== "super_admin") {
    res.status(403).json({ error: "Only super admins can grant content access." });
    return;
  }
  const { content_type, content_id, granted_to } = req.body as {
    content_type: string;
    content_id: string;
    granted_to: string;
  };
  if (!content_type || !content_id || !granted_to) {
    res.status(400).json({ error: "content_type, content_id, and granted_to are required." });
    return;
  }
  const VALID_TYPES = ["subject", "quiz", "topic"];
  if (!VALID_TYPES.includes(content_type)) {
    res.status(400).json({ error: "content_type must be 'subject', 'quiz', or 'topic'." });
    return;
  }

  // Prevent granting access to yourself
  if (granted_to === actorId) {
    res.status(400).json({ error: "You cannot grant access to yourself." });
    return;
  }

  const { data, error } = await supabase
    .from("content_access_grants")
    .insert({ content_type, content_id, granted_to, granted_by: actorId })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") { res.status(409).json({ error: "This grant already exists." }); return; }
    res.status(500).json({ error: error.message });
    return;
  }
  await writeAuditLog(actorId, "content_grant_created", content_type, content_id, { granted_to });
  res.status(201).json(data);
});

router.delete("/admin/content/grants/:grantId", requireAdmin, async (req: AuthRequest, res) => {
  const actorId = req.user!.id;
  if (req.user!.role !== "super_admin") {
    res.status(403).json({ error: "Only super admins can revoke content grants." });
    return;
  }
  const { grantId } = req.params as { grantId: string };
  const { data: grant } = await supabase
    .from("content_access_grants")
    .select("content_type, content_id, granted_to")
    .eq("id", grantId)
    .single();
  const { error } = await supabase.from("content_access_grants").delete().eq("id", grantId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  if (grant) {
    await writeAuditLog(actorId, "content_grant_revoked", grant.content_type, grant.content_id, {
      granted_to: grant.granted_to,
    });
  }
  res.json({ message: "Grant revoked." });
});

export default router;
