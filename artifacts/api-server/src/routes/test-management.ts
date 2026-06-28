import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";
import { capText, isValidUuid, sanitizeEnum } from "../lib/sanitize";
import { logger } from "../lib/logger";

const router = Router();

const VALID_ROLES = ["student", "admin", "super_admin"] as const;
const VALID_QUIZ_TYPES = [
  "lecture_quiz", "dpp", "pyq", "topic_test",
  "chapter_test", "subject_test", "grand_test",
] as const;

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
    // best-effort — never crash on audit failure
  }
}

type QuestionType = "SCQ" | "MCQ" | "NAT";

interface RawQuestion {
  question_text?: unknown;
  question_type?: unknown;
  options?: unknown;
  correct_answer?: unknown;
  explanation?: unknown;
  video_solution_url?: unknown;
  difficulty?: unknown;
  order_index?: unknown;
}

function normalizeQuestionType(raw: unknown): QuestionType {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "MCQ") return "MCQ";
  if (s === "NAT") return "NAT";
  return "SCQ";
}

function normalizeCorrectAnswer(questionType: QuestionType, raw: string): string {
  if (questionType === "NAT") return raw.trim();
  if (questionType === "MCQ") {
    return raw.split(",").map(v => v.trim().toUpperCase()).filter(Boolean).sort().join(",");
  }
  return raw.trim().toUpperCase();
}

function isValidOptions(opts: unknown, questionType: QuestionType): boolean {
  if (questionType === "NAT") return true;
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) return false;
  const o = opts as Record<string, unknown>;
  if (!("A" in o) || typeof o["A"] !== "string" || (o["A"] as string).trim() === "") return false;
  if (!("B" in o) || typeof o["B"] !== "string" || (o["B"] as string).trim() === "") return false;
  for (const k of ["C", "D"] as const) {
    if (k in o && o[k] !== null && o[k] !== "") {
      if (typeof o[k] !== "string" || (o[k] as string).trim() === "") return false;
    }
  }
  return true;
}

function validateQuestion(
  raw: RawQuestion,
  idx: number
): { valid: true; row: Record<string, unknown> } | { valid: false; error: string } {
  const question_text =
    typeof raw.question_text === "string" ? raw.question_text.trim() : "";
  if (!question_text)
    return { valid: false, error: `Row ${idx + 1}: question_text is missing` };

  const question_type = normalizeQuestionType(raw.question_type);

  if (!isValidOptions(raw.options, question_type))
    return { valid: false, error: `Row ${idx + 1}: options must have non-empty A and B (question_type=${question_type})` };

  const rawAnswer =
    typeof raw.correct_answer === "string" ? raw.correct_answer.trim() : "";
  if (!rawAnswer)
    return { valid: false, error: `Row ${idx + 1}: correct_answer is missing` };

  if (question_type === "NAT") {
    if (isNaN(parseFloat(rawAnswer)))
      return { valid: false, error: `Row ${idx + 1}: NAT correct_answer must be a number (got "${rawAnswer}")` };
  } else if (question_type === "MCQ") {
    const parts = rawAnswer.split(",").map(v => v.trim().toUpperCase()).filter(Boolean);
    if (parts.length < 2)
      return { valid: false, error: `Row ${idx + 1}: MCQ correct_answer needs ≥2 options e.g. "A,C" (got "${rawAnswer}")` };
    if (!parts.every(p => ["A", "B", "C", "D"].includes(p)))
      return { valid: false, error: `Row ${idx + 1}: MCQ correct_answer must only contain A,B,C,D (got "${rawAnswer}")` };
  } else {
    if (!["A", "B", "C", "D"].includes(rawAnswer.toUpperCase()))
      return {
        valid: false,
        error: `Row ${idx + 1}: correct_answer must be A, B, C, or D for SCQ (got "${String(raw.correct_answer)}")`,
      };
  }

  const correct_answer = normalizeCorrectAnswer(question_type, rawAnswer);
  const diff = Number(raw.difficulty ?? 3);
  const difficulty = isNaN(diff) || diff < 1 || diff > 5 ? 3 : Math.round(diff);
  const oi = Number(raw.order_index ?? idx);

  return {
    valid: true,
    row: {
      question_text,
      question_type,
      options: question_type === "NAT" ? null : raw.options,
      correct_answer,
      explanation:
        typeof raw.explanation === "string" && raw.explanation.trim()
          ? raw.explanation.trim()
          : null,
      video_solution_url:
        typeof raw.video_solution_url === "string" && raw.video_solution_url.trim()
          ? raw.video_solution_url.trim()
          : null,
      difficulty,
      order_index: isNaN(oi) ? idx : oi,
    },
  };
}

// ── POST /api/admin/test-management/create ────────────────────────────────────
// Atomically creates a quiz and bulk-imports its questions.
// On any question-insert failure the quiz is rolled back.
router.post("/admin/test-management/create", requireAdmin, async (req: AuthRequest, res) => {
  const actorId = req.user!.id;
  const actorRole = req.user!.role;

  const {
    subject_id,
    chapter_id,
    topic_id,
    title,
    type,
    duration_minutes,
    passing_score,
    negative_marking,
    max_attempts,
    allowed_roles,
    questions,
  } = req.body as {
    subject_id?: string;
    chapter_id?: string;
    topic_id?: string;
    title?: string;
    type?: string;
    duration_minutes?: number;
    passing_score?: number;
    negative_marking?: number;
    max_attempts?: number;
    allowed_roles?: string[];
    questions?: RawQuestion[];
  };

  // ── Validate title ──────────────────────────────────────────────────────────
  const safeTitle = capText(title ?? "", 200);
  if (!safeTitle) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  // ── Validate type ───────────────────────────────────────────────────────────
  const safeType = sanitizeEnum(type ?? "chapter_test", [...VALID_QUIZ_TYPES]);
  if (!safeType) {
    res.status(400).json({ error: `type must be one of: ${VALID_QUIZ_TYPES.join(", ")}` });
    return;
  }

  // ── Validate hierarchy ──────────────────────────────────────────────────────
  if (!subject_id || !isValidUuid(subject_id)) {
    res.status(400).json({ error: "subject_id is required and must be a valid UUID" });
    return;
  }
  if (chapter_id && !isValidUuid(chapter_id)) {
    res.status(400).json({ error: "chapter_id must be a valid UUID" });
    return;
  }
  if (topic_id && !isValidUuid(topic_id)) {
    res.status(400).json({ error: "topic_id must be a valid UUID" });
    return;
  }

  // Verify subject exists
  const { data: subject } = await supabase
    .from("subjects")
    .select("id")
    .eq("id", subject_id)
    .single();
  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  // Verify chapter belongs to the subject
  if (chapter_id) {
    const { data: chapter } = await supabase
      .from("chapters")
      .select("id, subject_id")
      .eq("id", chapter_id)
      .single();
    if (!chapter || chapter.subject_id !== subject_id) {
      res.status(400).json({ error: "chapter_id does not belong to the selected subject" });
      return;
    }
  }

  // ── Validate allowed_roles ──────────────────────────────────────────────────
  const safeRoles =
    Array.isArray(allowed_roles) && allowed_roles.length > 0
      ? allowed_roles.filter((r) => (VALID_ROLES as readonly string[]).includes(r))
      : ["student", "admin", "super_admin"];
  if (safeRoles.length === 0) {
    res.status(400).json({ error: "allowed_roles must contain at least one valid role" });
    return;
  }

  // ── Validate questions ──────────────────────────────────────────────────────
  if (!Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: "questions must be a non-empty array" });
    return;
  }
  if (questions.length > 500) {
    res.status(400).json({ error: "Maximum 500 questions per import" });
    return;
  }

  const validRows: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const result = validateQuestion(questions[i] as RawQuestion, i);
    if (result.valid) {
      validRows.push(result.row);
    } else {
      errors.push(result.error);
    }
  }

  if (validRows.length === 0) {
    res.status(422).json({ error: "No valid questions to import", errors });
    return;
  }

  // ── Create the quiz ─────────────────────────────────────────────────────────
  const quizPayload = {
    title: safeTitle,
    type: safeType,
    subject_id,
    chapter_id: chapter_id ?? null,
    topic_id: topic_id ?? null,
    duration_minutes: Math.max(1, Number(duration_minutes ?? 30) || 30),
    passing_score: Math.min(100, Math.max(0, Number(passing_score ?? 60) || 60)),
    negative_marking: Math.max(0, Number(negative_marking ?? 0)),
    max_attempts: Math.max(1, Number(max_attempts ?? 3) || 3),
    allowed_roles: safeRoles,
    is_active: true,
    creator_id: actorId,
  };

  const { data: quiz, error: quizErr } = await supabase
    .from("quizzes")
    .insert(quizPayload)
    .select("id")
    .single();

  if (quizErr || !quiz) {
    logger.error({ err: quizErr }, "[test-mgmt] Failed to create quiz");
    res.status(500).json({ error: `Failed to create test: ${quizErr?.message ?? "unknown"}` });
    return;
  }

  const quizId = quiz.id as string;

  // ── Insert questions in batches ─────────────────────────────────────────────
  const questionsWithQuizId = validRows.map((q, i) => ({
    ...q,
    quiz_id: quizId,
    order_index: i,
  }));

  const BATCH = 100;
  let imported = 0;

  for (let i = 0; i < questionsWithQuizId.length; i += BATCH) {
    const batch = questionsWithQuizId.slice(i, i + BATCH);
    const { error: insertErr } = await supabase.from("quiz_questions").insert(batch);
    if (insertErr) {
      // Roll back — delete the newly created quiz (cascades to quiz_questions)
      await supabase.from("quizzes").delete().eq("id", quizId);
      logger.error({ err: insertErr, quizId }, "[test-mgmt] Question insert failed, quiz rolled back");
      res.status(500).json({
        error: `Question import failed: ${insertErr.message}`,
        errors,
      });
      return;
    }
    imported += batch.length;
  }

  const skipped = questions.length - imported - errors.length;

  // ── Audit log ───────────────────────────────────────────────────────────────
  await writeAuditLog(actorId, "test_management_create", "quiz", quizId, {
    title: safeTitle,
    subject_id,
    chapter_id: chapter_id ?? null,
    topic_id: topic_id ?? null,
    imported,
    skipped,
    failed: errors.length,
    errors: errors.slice(0, 20),
    created_by_role: actorRole,
  });

  res.status(201).json({
    quiz_id: quizId,
    imported,
    skipped,
    errors,
    message: `Test created with ${imported} question${imported !== 1 ? "s" : ""}`,
  });
});

// ── GET /api/admin/test-management/import-logs ────────────────────────────────
// Returns audit_logs for test_management_create actions.
// Super admins see all; admins see only their own.
router.get("/admin/test-management/import-logs", requireAdmin, async (req: AuthRequest, res) => {
  const actorId = req.user!.id;
  const actorRole = req.user!.role;

  let query = supabase
    .from("audit_logs")
    .select("id, actor_id, action, target_type, target_id, new_value, created_at")
    .eq("action", "test_management_create")
    .order("created_at", { ascending: false })
    .limit(100);

  if (actorRole !== "super_admin") {
    query = query.eq("actor_id", actorId);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Enrich with profile names
  const actorIds = [...new Set((data ?? []).map((r: Record<string, unknown>) => r.actor_id as string))];
  let profileMap: Record<string, { full_name: string; email: string }> = {};

  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const p of (profiles ?? []) as { id: string; full_name: string; email: string }[]) {
      profileMap[p.id] = { full_name: p.full_name, email: p.email };
    }
  }

  const enriched = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    actor: profileMap[r.actor_id as string] ?? null,
  }));

  res.json(enriched);
});

// ── DELETE /api/admin/test-management/:quizId ─────────────────────────────────
// Admins can delete only tests they created; super admins can delete any.
router.delete("/admin/test-management/:quizId", requireAdmin, async (req: AuthRequest, res) => {
  const actorId = req.user!.id;
  const actorRole = req.user!.role;
  const { quizId } = req.params as { quizId: string };

  if (!isValidUuid(quizId)) {
    res.status(400).json({ error: "Invalid quiz ID" });
    return;
  }

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, creator_id")
    .eq("id", quizId)
    .single();

  if (!quiz) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  if (actorRole !== "super_admin" && (quiz as { creator_id: string }).creator_id !== actorId) {
    res.status(403).json({ error: "You can only delete tests you created" });
    return;
  }

  const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  await writeAuditLog(actorId, "test_management_delete", "quiz", quizId, {
    title: (quiz as { title: string }).title,
  });

  res.json({ message: "Test deleted" });
});

// ── POST /api/admin/test-management/:quizId/duplicate ─────────────────────────
// Creates a copy of a quiz and all its questions.
router.post("/admin/test-management/:quizId/duplicate", requireAdmin, async (req: AuthRequest, res) => {
  const actorId = req.user!.id;
  const actorRole = req.user!.role;
  const { quizId } = req.params as { quizId: string };

  if (!isValidUuid(quizId)) {
    res.status(400).json({ error: "Invalid quiz ID" });
    return;
  }

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", quizId)
    .single();

  if (!quiz) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  const q = quiz as Record<string, unknown>;

  if (actorRole !== "super_admin" && q.creator_id !== actorId) {
    res.status(403).json({ error: "You can only duplicate tests you created" });
    return;
  }

  // Build new quiz payload without generated columns
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = q;
  const { data: newQuiz, error: newErr } = await supabase
    .from("quizzes")
    .insert({ ...rest, title: `${String(q.title)} (Copy)`, creator_id: actorId })
    .select("id")
    .single();

  if (newErr || !newQuiz) {
    res.status(500).json({ error: `Duplicate failed: ${newErr?.message ?? "unknown"}` });
    return;
  }

  const newQuizId = (newQuiz as { id: string }).id;

  // Copy questions
  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("question_text, question_type, options, correct_answer, explanation, video_solution_url, difficulty, order_index")
    .eq("quiz_id", quizId);

  if (questions && questions.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < questions.length; i += BATCH) {
      const batch = (questions.slice(i, i + BATCH) as Record<string, unknown>[]).map((q2) => ({
        ...q2,
        quiz_id: newQuizId,
      }));
      await supabase.from("quiz_questions").insert(batch);
    }
  }

  await writeAuditLog(actorId, "test_management_duplicate", "quiz", newQuizId, {
    source_quiz_id: quizId,
    title: String(q.title),
  });

  res.status(201).json({
    quiz_id: newQuizId,
    question_count: questions?.length ?? 0,
    message: "Test duplicated",
  });
});

// ── PATCH /api/admin/test-management/:quizId/visibility ───────────────────────
// Updates allowed_roles for a test.
router.patch("/admin/test-management/:quizId/visibility", requireAdmin, async (req: AuthRequest, res) => {
  const actorId = req.user!.id;
  const actorRole = req.user!.role;
  const { quizId } = req.params as { quizId: string };
  const { allowed_roles } = req.body as { allowed_roles?: string[] };

  if (!isValidUuid(quizId)) {
    res.status(400).json({ error: "Invalid quiz ID" });
    return;
  }
  if (
    !Array.isArray(allowed_roles) ||
    allowed_roles.length === 0 ||
    !allowed_roles.every((r) => (VALID_ROLES as readonly string[]).includes(r))
  ) {
    res.status(400).json({ error: "allowed_roles must be a non-empty array of valid roles" });
    return;
  }

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, creator_id, title")
    .eq("id", quizId)
    .single();

  if (!quiz) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  if (actorRole !== "super_admin" && (quiz as { creator_id: string }).creator_id !== actorId) {
    res.status(403).json({ error: "You can only update visibility of tests you created" });
    return;
  }

  const { data, error } = await supabase
    .from("quizzes")
    .update({ allowed_roles })
    .eq("id", quizId)
    .select("id, title, allowed_roles")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  await writeAuditLog(actorId, "test_management_visibility_update", "quiz", quizId, {
    allowed_roles,
    title: (quiz as { title: string }).title,
  });

  res.json(data);
});

export default router;
