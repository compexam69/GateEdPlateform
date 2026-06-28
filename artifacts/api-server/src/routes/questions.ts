import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

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
  if (!("A" in o) || typeof o["A"] !== "string" || o["A"].trim() === "") return false;
  if (!("B" in o) || typeof o["B"] !== "string" || o["B"].trim() === "") return false;
  for (const k of ["C", "D"]) {
    if (k in o && o[k] !== null && o[k] !== "" && (typeof o[k] !== "string" || (o[k] as string).trim() === "")) return false;
  }
  return true;
}

function validateQuestion(raw: RawQuestion, idx: number): { valid: true; row: Record<string, unknown> } | { valid: false; error: string } {
  const question_text = typeof raw.question_text === "string" ? raw.question_text.trim() : "";
  if (!question_text) return { valid: false, error: `Row ${idx + 1}: missing question_text` };

  const question_type = normalizeQuestionType(raw.question_type);

  if (!isValidOptions(raw.options, question_type)) {
    return { valid: false, error: `Row ${idx + 1}: options must have non-empty A and B (question_type=${question_type})` };
  }

  const rawAnswer = typeof raw.correct_answer === "string" ? raw.correct_answer.trim() : "";
  if (!rawAnswer) return { valid: false, error: `Row ${idx + 1}: correct_answer is missing` };

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
      return { valid: false, error: `Row ${idx + 1}: correct_answer must be A, B, C, or D (got "${raw.correct_answer}")` };
  }

  const correct_answer = normalizeCorrectAnswer(question_type, rawAnswer);
  const difficulty = Number(raw.difficulty ?? 3);
  const safeD = isNaN(difficulty) || difficulty < 1 || difficulty > 5 ? 3 : Math.round(difficulty);
  const order_index = Number(raw.order_index ?? idx);

  return {
    valid: true,
    row: {
      question_text,
      question_type,
      options: question_type === "NAT" ? null : raw.options,
      correct_answer,
      explanation: typeof raw.explanation === "string" && raw.explanation.trim() ? raw.explanation.trim() : null,
      video_solution_url: typeof raw.video_solution_url === "string" && raw.video_solution_url.trim() ? raw.video_solution_url.trim() : null,
      difficulty: safeD,
      order_index: isNaN(order_index) ? idx : order_index,
    },
  };
}

// POST /api/questions/bulk-import
// Body: { quiz_id: string, questions: RawQuestion[] }
// Returns: { imported: number, skipped: number, errors: string[] }
router.post("/questions/bulk-import", requireAdmin, async (req: AuthRequest, res) => {
  const { quiz_id, questions } = req.body as { quiz_id?: unknown; questions?: unknown };

  if (typeof quiz_id !== "string" || !quiz_id) {
    res.status(400).json({ error: "quiz_id is required" });
    return;
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: "questions must be a non-empty array" });
    return;
  }
  if (questions.length > 500) {
    res.status(400).json({ error: "Maximum 500 questions per import" });
    return;
  }

  // Verify quiz exists
  const { data: quiz, error: quizErr } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", quiz_id)
    .single();

  if (quizErr || !quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }

  // Validate all rows, collect errors without stopping
  const rows: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const result = validateQuestion(questions[i] as RawQuestion, i);
    if (result.valid) {
      rows.push({ ...result.row, quiz_id });
    } else {
      errors.push(result.error);
    }
  }

  if (rows.length === 0) {
    res.status(422).json({ error: "No valid questions to import", errors });
    return;
  }

  // Insert in batches of 100 to stay within Supabase payload limits
  const BATCH = 100;
  let imported = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error: insertErr } = await supabase.from("quiz_questions").insert(batch);
    if (insertErr) {
      res.status(500).json({ error: `Database insert failed: ${insertErr.message}`, errors });
      return;
    }
    imported += batch.length;
  }

  res.status(200).json({
    imported,
    skipped: questions.length - imported - errors.length,
    errors,
  });
});

export default router;
