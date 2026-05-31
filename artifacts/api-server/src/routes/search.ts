import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

// ── GET /search?q=...&limit=50 ────────────────────────────────────────────────
// Searches subjects, chapters, and topics by title (ilike, case-insensitive).
// Returns up to `limit` results with full hierarchy context (subject → chapter → topic).
// Only accessible to admin/super_admin. No SQL changes required — uses existing tables.
router.get("/search", requireAdmin, async (req: AuthRequest, res) => {
  const q = ((req.query["q"] as string) ?? "").trim();
  if (!q || q.length < 2) {
    res.json([]);
    return;
  }

  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const perType = Math.ceil(limit / 3);
  const pattern = `%${q}%`;

  const [subjectsRes, chaptersRes, topicsRes] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, title")
      .ilike("title", pattern)
      .order("title")
      .limit(perType),
    supabase
      .from("chapters")
      .select("id, title, subject_id, subjects(id, title)")
      .ilike("title", pattern)
      .order("title")
      .limit(perType),
    supabase
      .from("topics")
      .select("id, title, chapter_id, chapters(id, title, subject_id, subjects(id, title))")
      .ilike("title", pattern)
      .order("title")
      .limit(perType),
  ]);

  type SearchResult = {
    type: "subject" | "chapter" | "topic";
    subject_id: string;
    subject_title: string;
    chapter_id?: string;
    chapter_title?: string;
    topic_id?: string;
    topic_title?: string;
  };

  const results: SearchResult[] = [];

  for (const s of subjectsRes.data ?? []) {
    results.push({
      type: "subject",
      subject_id: s.id as string,
      subject_title: s.title as string,
    });
  }

  for (const c of chaptersRes.data ?? []) {
    const sub = (c as { subjects?: { id: string; title: string } | null }).subjects;
    if (!sub) continue;
    results.push({
      type: "chapter",
      subject_id: sub.id,
      subject_title: sub.title,
      chapter_id: c.id as string,
      chapter_title: c.title as string,
    });
  }

  for (const t of topicsRes.data ?? []) {
    const ch = (t as {
      chapters?: {
        id: string;
        title: string;
        subject_id: string;
        subjects?: { id: string; title: string } | null;
      } | null;
    }).chapters;
    if (!ch || !ch.subjects) continue;
    results.push({
      type: "topic",
      subject_id: ch.subjects.id,
      subject_title: ch.subjects.title,
      chapter_id: ch.id,
      chapter_title: ch.title,
      topic_id: t.id as string,
      topic_title: t.title as string,
    });
  }

  res.json(results);
});

export default router;
