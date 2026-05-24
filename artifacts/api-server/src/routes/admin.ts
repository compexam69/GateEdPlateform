import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";
import { sendApprovalEmail, sendStorageAlertEmail } from "../lib/email";
import { sendPushToUser, sendPushToAll } from "../lib/push";

const router = Router();

async function writeAuditLog(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  newValue?: Record<string, unknown>
) {
  try {
    await supabase.from("audit_logs").insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      new_value: newValue ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // audit log writes are best-effort
  }
}

router.get("/admin/users", requireAdmin, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
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
    profile ? sendApprovalEmail(profile.email, profile.full_name ?? "Student") : Promise.resolve(),
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
          try { await sendStorageAlertEmail(admin.email, totalBytes / (1024 * 1024 * 1024), GLOBAL_LIMIT / (1024 * 1024 * 1024)); } catch { /* best-effort */ }
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
    config[row.key] = typeof row.value === "object" ? row.value : row.value;
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

export default router;

