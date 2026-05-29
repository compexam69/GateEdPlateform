import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { checkRateLimitDb } from "../middlewares/rateLimitDb";
import { logger } from "../lib/logger";

const router = Router();

router.post("/exam/start", requireAuth, async (req: AuthRequest, res) => {
  const { quiz_id } = req.body as { quiz_id: string };
  const userId = req.user!.id;

  // Per-user persistent rate check: 5 starts/minute (survives server restarts)
  const { allowed, retryAfterMs } = await checkRateLimitDb(`exam-start:${userId}`, 5, 60_000);
  if (!allowed) {
    res.status(429).json({
      error: "Too many quiz attempts. Please wait a minute before trying again.",
      retryAfter: Math.ceil(retryAfterMs / 1000),
    });
    return;
  }

  const { data: quiz, error: qErr } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", quiz_id)
    .single();
  if (qErr || !quiz) { res.status(404).json({ error: "Quiz not found" }); return; }

  // Access control: student and admin roles must be explicitly listed in allowed_roles.
  // super_admin always has access (for testing/preview).
  const userRole = req.user!.role;
  const allowedRoles: string[] = quiz.allowed_roles ?? ["student", "admin", "super_admin"];
  if (userRole !== "super_admin" && !allowedRoles.includes(userRole)) {
    res.status(403).json({
      error: "You do not have permission to access this exam.",
      code: "EXAM_ACCESS_DENIED",
    });
    return;
  }

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
  const quiz = attempt.quizzes as { negative_marking: number; passing_score: number; type: string; topic_id?: string; chapter_id?: string; subject_id?: string };
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

  // ── Progress cascade ──────────────────────────────────────────────────────
  const quizType = quiz?.type ?? "";
  const topicId = quiz?.topic_id ?? null;
  const chapterId = quiz?.chapter_id ?? null;
  const subjectId = quiz?.subject_id ?? null;

  try {
    if (topicId) {
      await handleTopicQuizProgress(userId, topicId, quizType, passed, accuracy);
    }
    if (chapterId) {
      await handleChapterQuizProgress(userId, chapterId, quizType, passed);
    }
    if (subjectId) {
      await handleSubjectQuizProgress(userId, subjectId, quizType, passed);
    }
  } catch (cascadeErr) {
    logger.error({ err: cascadeErr }, "Progress cascade error");
  }

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

async function handleTopicQuizProgress(userId: string, topicId: string, quizType: string, passed: boolean, accuracy: number) {
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("user_topic_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("topic_id", topicId)
    .maybeSingle();

  const current = existing ?? {};
  const updates: Record<string, unknown> = { updated_at: now };

  if (quizType === "lecture_quiz") {
    if (passed) {
      updates["lecture_quiz_passed"] = true;
      updates["lecture_quiz_score"] = accuracy;
    }
  } else if (quizType === "dpp") {
    if (passed) {
      updates["dpp_completed"] = true;
      updates["dpp_score"] = accuracy;
    }
  } else if (quizType === "pyqs") {
    if (passed || accuracy >= 0) {
      updates["pyqs_completed"] = true;
      updates["pyqs_score"] = accuracy;
    }
  } else if (quizType === "topic_test") {
    if (passed) {
      updates["topic_test_passed"] = true;
      updates["topic_test_score"] = accuracy;
      updates["topic_complete"] = true;

      // Check if all topics in the chapter are now complete
      const { data: topic } = await supabase
        .from("topics")
        .select("chapter_id")
        .eq("id", topicId)
        .single();

      if (topic?.chapter_id) {
        await checkAndUpdateChapterCompletion(userId, topic.chapter_id, now);
      }
    } else {
      updates["topic_test_score"] = accuracy;
    }
  }

  if (Object.keys(updates).length > 1) {
    if (existing) {
      await supabase
        .from("user_topic_progress")
        .update(updates)
        .eq("user_id", userId)
        .eq("topic_id", topicId);
    } else {
      await supabase
        .from("user_topic_progress")
        .insert({ user_id: userId, topic_id: topicId, lecture_clicked: (current as { lecture_clicked?: boolean }).lecture_clicked ?? false, ...updates });
    }
  }
}

async function checkAndUpdateChapterCompletion(userId: string, chapterId: string, now: string) {
  const { data: allTopics } = await supabase
    .from("topics")
    .select("id")
    .eq("chapter_id", chapterId)
    .eq("is_active", true);

  if (!allTopics || allTopics.length === 0) return;

  const topicIds = allTopics.map((t: { id: string }) => t.id);
  const { data: completedTopics } = await supabase
    .from("user_topic_progress")
    .select("topic_id")
    .eq("user_id", userId)
    .eq("topic_complete", true)
    .in("topic_id", topicIds);

  const allComplete = (completedTopics?.length ?? 0) >= topicIds.length;

  if (allComplete) {
    const { data: existing } = await supabase
      .from("user_chapter_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("chapter_id", chapterId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("user_chapter_progress")
        .update({ all_topics_complete: true, updated_at: now })
        .eq("user_id", userId)
        .eq("chapter_id", chapterId);
    } else {
      await supabase
        .from("user_chapter_progress")
        .insert({ user_id: userId, chapter_id: chapterId, all_topics_complete: true, updated_at: now });
    }
  }
}

async function handleChapterQuizProgress(userId: string, chapterId: string, quizType: string, passed: boolean) {
  if (quizType !== "chapter_test") return;
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("user_chapter_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("chapter_id", chapterId)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    chapter_test_attempted: true,
    pdf_upload_unlocked: true,
    updated_at: now,
  };
  if (passed) {
    updates["chapter_test_passed"] = true;

    // Check if all chapters in subject are complete
    const { data: chapter } = await supabase
      .from("chapters")
      .select("subject_id")
      .eq("id", chapterId)
      .single();

    if (chapter?.subject_id) {
      await checkAndUpdateSubjectCompletion(userId, chapter.subject_id, now);
    }
  }

  if (existing) {
    await supabase
      .from("user_chapter_progress")
      .update(updates)
      .eq("user_id", userId)
      .eq("chapter_id", chapterId);
  } else {
    await supabase
      .from("user_chapter_progress")
      .insert({ user_id: userId, chapter_id: chapterId, ...updates });
  }
}

async function checkAndUpdateSubjectCompletion(userId: string, subjectId: string, now: string) {
  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("is_active", true);

  if (!allChapters || allChapters.length === 0) return;

  const chapterIds = allChapters.map((c: { id: string }) => c.id);
  const { data: passedChapters } = await supabase
    .from("user_chapter_progress")
    .select("chapter_id")
    .eq("user_id", userId)
    .eq("chapter_test_passed", true)
    .in("chapter_id", chapterIds);

  const allComplete = (passedChapters?.length ?? 0) >= chapterIds.length;

  if (allComplete) {
    const { data: existing } = await supabase
      .from("user_subject_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("user_subject_progress")
        .update({ all_chapters_complete: true, updated_at: now })
        .eq("user_id", userId)
        .eq("subject_id", subjectId);
    } else {
      await supabase
        .from("user_subject_progress")
        .insert({ user_id: userId, subject_id: subjectId, all_chapters_complete: true, updated_at: now });
    }
  }
}

async function handleSubjectQuizProgress(userId: string, subjectId: string, quizType: string, passed: boolean) {
  if (quizType !== "subject_test" && quizType !== "grand_test") return;
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("user_subject_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    subject_test_attempted: true,
    updated_at: now,
  };
  if (passed) {
    updates["subject_test_passed"] = true;
  }

  if (existing) {
    await supabase
      .from("user_subject_progress")
      .update(updates)
      .eq("user_id", userId)
      .eq("subject_id", subjectId);
  } else {
    await supabase
      .from("user_subject_progress")
      .insert({ user_id: userId, subject_id: subjectId, ...updates });
  }
}

router.get("/exam/results/:resultId", requireAuth, async (req: AuthRequest, res) => {
  const { data: attempt } = await supabase
    .from("user_attempts")
    .select("*, quizzes(title, passing_score, negative_marking)")
    .eq("id", req.params["resultId"])
    .eq("user_id", req.user!.id)
    .single();
  if (!attempt) { res.status(404).json({ error: "Not found" }); return; }

  const [answersRes, allAttemptsRes] = await Promise.all([
    supabase
      .from("user_answers")
      .select("*, quiz_questions(question_text, options, correct_answer, explanation, video_solution_url, qr_code_url)")
      .eq("attempt_id", req.params["resultId"]),
    supabase
      .from("user_attempts")
      .select("accuracy")
      .eq("quiz_id", attempt.quiz_id)
      .eq("status", "submitted"),
  ]);

  const quiz = attempt.quizzes as { passing_score: number };
  const passed = attempt.accuracy >= (quiz?.passing_score ?? 60);

  // Rank & percentile among all submitted attempts for this quiz
  const allAccuracies = (allAttemptsRes.data ?? []).map((a: { accuracy: number }) => a.accuracy);
  const totalAttempts = allAccuracies.length;
  const rank = allAccuracies.filter((a) => a > attempt.accuracy).length + 1;
  const percentile = totalAttempts > 1
    ? Math.round(((totalAttempts - rank) / (totalAttempts - 1)) * 100)
    : 100;

  res.json({
    ...attempt,
    passed,
    answers: answersRes.data ?? [],
    rank,
    percentile,
    total_attempts: totalAttempts,
  });
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
  const { data, error } = await supabase
    .from("quizzes")
    .insert({ ...req.body, creator_id: req.user!.id })
    .select()
    .single();
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
  const qr_code_url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(youtube_url)}`;
  res.json({ qr_code_url, youtube_url });
});

// Server-time sync: returns authoritative remaining seconds for an in-progress attempt
router.get("/exam/time-remaining/:attemptId", requireAuth, async (req: AuthRequest, res) => {
  const { attemptId } = req.params as { attemptId: string };
  const userId = req.user!.id;

  const { data: attempt } = await supabase
    .from("user_attempts")
    .select("started_at, quizzes(duration_minutes)")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .maybeSingle();

  if (!attempt) {
    res.status(404).json({ error: "Attempt not found or already completed" });
    return;
  }

  const quiz = attempt.quizzes as unknown as { duration_minutes: number };
  const startedAt = new Date(attempt.started_at as string).getTime();
  const durationMs = (quiz.duration_minutes ?? 30) * 60 * 1000;
  const elapsed = Date.now() - startedAt;
  const timeRemainingMs = Math.max(0, durationMs - elapsed);

  res.json({
    time_remaining_ms: timeRemainingMs,
    time_remaining_seconds: Math.floor(timeRemainingMs / 1000),
    server_time: new Date().toISOString(),
  });
});

export default router;
