import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.post("/exam/start", requireAuth, async (req: AuthRequest, res) => {
  const { quiz_id } = req.body as { quiz_id: string };
  const userId = req.user!.id;

  const { data: quiz, error: qErr } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", quiz_id)
    .single();
  if (qErr || !quiz) { res.status(404).json({ error: "Quiz not found" }); return; }

  const { data: questions, error: questErr } = await supabase
    .from("quiz_questions")
    .select("id, quiz_id, question_text, options, difficulty, order_index, video_solution_url, qr_code_url")
    .eq("quiz_id", quiz_id)
    .order("order_index");
  if (questErr) { res.status(500).json({ error: questErr.message }); return; }

  const { data: attempt, error: aErr } = await supabase
    .from("user_attempts")
    .insert({
      user_id: userId,
      quiz_id,
      status: "in_progress",
      started_at: new Date().toISOString(),
      score: 0,
      total_marks: questions?.length ?? 0,
      accuracy: 0,
      time_taken_ms: 0,
      negative_marks_applied: 0,
    })
    .select()
    .single();
  if (aErr) { res.status(500).json({ error: aErr.message }); return; }

  res.status(201).json({
    attempt_id: attempt.id,
    quiz_id,
    started_at: attempt.started_at,
    duration_minutes: quiz.duration_minutes,
    questions: questions ?? [],
  });
});

router.post("/exam/submit", requireAuth, async (req: AuthRequest, res) => {
  const { attempt_id, answers } = req.body as {
    attempt_id: string;
    answers: Array<{ question_id: string; selected_option?: string; time_spent_ms?: number; is_marked_for_review?: boolean }>;
  };
  const userId = req.user!.id;

  const { data: attempt } = await supabase
    .from("user_attempts")
    .select("*, quizzes(*)")
    .eq("id", attempt_id)
    .eq("user_id", userId)
    .single();
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("quiz_id", attempt.quiz_id);

  const questionMap = new Map((questions ?? []).map((q: { id: string; correct_answer: string; explanation: string | null; video_solution_url: string | null; qr_code_url: string | null }) => [q.id, q]));
  const quiz = attempt.quizzes as { negative_marking: number; passing_score: number };
  const negMark = quiz?.negative_marking ?? 0;
  const passingScore = quiz?.passing_score ?? 60;

  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  let negativeApplied = 0;

  const answerResults = answers.map((a) => {
    const q = questionMap.get(a.question_id);
    if (!q) return null;
    const isCorrect = a.selected_option ? a.selected_option === q.correct_answer : false;
    const isSkipped = !a.selected_option;
    if (isSkipped) skipped++;
    else if (isCorrect) correct++;
    else { incorrect++; negativeApplied += negMark; }
    return {
      question_id: a.question_id,
      selected_option: a.selected_option ?? null,
      correct_answer: q.correct_answer,
      is_correct: isCorrect,
      time_spent_ms: a.time_spent_ms ?? 0,
      explanation: q.explanation,
      video_solution_url: q.video_solution_url,
      qr_code_url: q.qr_code_url,
    };
  }).filter(Boolean);

  const totalQuestions = questions?.length ?? 1;
  const score = Math.max(0, correct - negativeApplied);
  const accuracy = totalQuestions > 0 ? (correct / totalQuestions) * 100 : 0;
  const passed = accuracy >= passingScore;
  const timeTaken = answers.reduce((sum, a) => sum + (a.time_spent_ms ?? 0), 0);

  await supabase.from("user_answers").insert(
    answerResults.map((a) => ({ attempt_id, ...a }))
  );

  await supabase
    .from("user_attempts")
    .update({
      status: "submitted",
      score,
      total_marks: totalQuestions,
      accuracy,
      time_taken_ms: timeTaken,
      negative_marks_applied: negativeApplied,
      submitted_at: new Date().toISOString(),
      is_correct_summary: { correct, incorrect, skipped },
    })
    .eq("id", attempt_id);

  res.json({
    attempt_id,
    quiz_id: attempt.quiz_id,
    score,
    total_marks: totalQuestions,
    accuracy,
    time_taken_ms: timeTaken,
    negative_marks_applied: negativeApplied,
    passed,
    status: "submitted",
    answers: answerResults,
    submitted_at: new Date().toISOString(),
  });
});

router.get("/exam/results/:resultId", requireAuth, async (req: AuthRequest, res) => {
  const { data: attempt } = await supabase
    .from("user_attempts")
    .select("*, quizzes(title, passing_score, negative_marking)")
    .eq("id", req.params["resultId"])
    .eq("user_id", req.user!.id)
    .single();
  if (!attempt) { res.status(404).json({ error: "Not found" }); return; }

  const { data: answers } = await supabase
    .from("user_answers")
    .select("*, quiz_questions(question_text, options, correct_answer, explanation, video_solution_url, qr_code_url)")
    .eq("attempt_id", req.params["resultId"]);

  const quiz = attempt.quizzes as { passing_score: number };
  const passed = attempt.accuracy >= (quiz?.passing_score ?? 60);

  res.json({ ...attempt, passed, answers: answers ?? [] });
});

router.get("/exam/history", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("user_attempts")
    .select("id, quiz_id, score, total_marks, accuracy, status, submitted_at, quizzes(title)")
    .eq("user_id", req.user!.id)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(50);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json((data ?? []).map((a: Record<string, unknown>) => {
    const q = a["quizzes"] as { title: string } | null;
    return {
      attempt_id: a["id"],
      quiz_id: a["quiz_id"],
      quiz_title: q?.title ?? "Unknown",
      score: a["score"],
      total_marks: a["total_marks"],
      accuracy: a["accuracy"],
      passed: (a["accuracy"] as number) >= 60,
      submitted_at: a["submitted_at"],
    };
  }));
});

router.get("/quizzes/:quizId/questions", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("id, quiz_id, question_text, options, difficulty, order_index, video_solution_url, qr_code_url")
    .eq("quiz_id", req.params["quizId"])
    .order("order_index");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/quizzes", requireAdmin, async (req: AuthRequest, res) => {
  const { data, error } = await supabase.from("quizzes").insert(req.body).select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.post("/questions", requireAdmin, async (req: AuthRequest, res) => {
  const { data, error } = await supabase.from("quiz_questions").insert(req.body).select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.post("/questions/bulk-import", requireAdmin, async (req: AuthRequest, res) => {
  const { quiz_id, questions } = req.body as { quiz_id: string; questions: unknown[] };
  if (!Array.isArray(questions)) { res.status(400).json({ error: "questions must be an array" }); return; }

  const rows = questions.map((q: unknown) => ({ ...(q as Record<string, unknown>), quiz_id }));
  const { data, error } = await supabase.from("quiz_questions").insert(rows).select();
  if (error) { res.status(500).json({ imported: 0, failed: rows.length, errors: [error.message] }); return; }
  res.status(201).json({ imported: data?.length ?? 0, failed: 0, errors: [] });
});

router.post("/qr/generate", requireAdmin, async (req: AuthRequest, res) => {
  const { youtube_url, level, reference_id } = req.body as { youtube_url: string; level: string; reference_id: string };
  const shortId = Buffer.from(`${level}:${reference_id}`).toString("base64url").slice(0, 16);
  const qr_code_url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(youtube_url)}`;
  res.json({ qr_code_url, youtube_url });
});

export default router;
