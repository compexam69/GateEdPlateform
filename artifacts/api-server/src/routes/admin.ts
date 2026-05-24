import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/admin/users", requireAdmin, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/admin/users/:userId/approve", requireAdmin, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("profiles")
    .update({ is_approved: true, status: "active" })
    .eq("id", req.params["userId"]);
  if (error) { res.status(500).json({ error: error.message }); return; }

  await supabase.auth.admin.updateUserById(req.params["userId"]!, {
    user_metadata: { is_approved: true, status: "active" },
  });

  res.json({ message: "User approved" });
});

router.post("/admin/users/:userId/reject", requireAdmin, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("profiles")
    .update({ is_approved: false, status: "suspended" })
    .eq("id", req.params["userId"]);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "User rejected/banned" });
});

router.post("/admin/users/:userId/reset-progress", requireAdmin, async (req: AuthRequest, res) => {
  const { scope, reference_id } = req.body as { scope: string; reference_id?: string };
  const userId = req.params["userId"];

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

  res.json({ message: "Progress reset" });
});

router.get("/admin/analytics", requireAdmin, async (req: AuthRequest, res) => {
  const [studentsRes, pendingRes, attemptsRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact" }).eq("role", "student"),
    supabase.from("profiles").select("id", { count: "exact" }).eq("status", "pending_approval"),
    supabase.from("user_attempts").select("accuracy").eq("status", "submitted"),
  ]);

  const totalStudents = studentsRes.count ?? 0;
  const pendingApprovals = pendingRes.count ?? 0;
  const attempts = attemptsRes.data ?? [];
  const avgAccuracy = attempts.length > 0
    ? attempts.reduce((s: number, a: { accuracy: number }) => s + a.accuracy, 0) / attempts.length
    : 0;

  res.json({
    total_students: totalStudents,
    pending_approvals: pendingApprovals,
    active_today: 0,
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

  const userMap = new Map<string, number>();
  for (const n of allNotes as { user_id: string; pdf_size_bytes: number }[]) {
    userMap.set(n.user_id, (userMap.get(n.user_id) ?? 0) + (n.pdf_size_bytes ?? 0));
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", Array.from(userMap.keys()));

  const profileMap = new Map((profiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));

  const topUsers = Array.from(userMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([uid, bytes]) => ({ user_id: uid, full_name: profileMap.get(uid) ?? "Unknown", used_bytes: bytes }));

  res.json({
    total_used_bytes: totalBytes,
    limit_bytes: GLOBAL_LIMIT,
    used_percentage: (totalBytes / GLOBAL_LIMIT) * 100,
    total_files: allNotes.length,
    top_users: topUsers,
  });
});

export default router;
