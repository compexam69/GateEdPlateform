import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

interface RawQuestion {
  question_text?: unknown;
  options?: unknown;
  correct_answer?: unknown;
  explanation?: unknown;
  video_solution_url?: unknown;
  difficulty?: unknown;
  order_index?: unknown;
}

function isValidOptions(opts: unknown): opts is Record<string, string> {
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) return false;
  const o = opts as Record<string, unknown>;
  return ["A", "B", "C", "D"].every(k => k in o && typeof o[k] === "string" && (o[k] as string).trim() !== "");
}

function validateQuestion(raw: RawQuestion, idx: number): { valid: true; row: Record<string, unknown> } | { valid: false; error: string } {
  const question_text = typeof raw.question_text === "string" ? raw.question_text.trim() : "";
  if (!question_text) return { valid: false, error: `Row ${idx + 1}: missing question_text` };

  if (!isValidOptions(raw.options)) {
    return { valid: false, error: `Row ${idx + 1}: options must be an object with non-empty A, B, C, D keys` };
  }

  const correct_answer = typeof raw.correct_answer === "string" ? raw.correct_answer.trim().toUpperCase() : "";
  if (!["A", "B", "C", "D"].includes(correct_answer)) {
    return { valid: false, error: `Row ${idx + 1}: correct_answer must be A, B, C, or D (got "${raw.correct_answer}")` };
  }

  const difficulty = Number(raw.difficulty ?? 3);
  const safeD = isNaN(difficulty) || difficulty < 1 || difficulty > 5 ? 3 : Math.round(difficulty);
  const order_index = Number(raw.order_index ?? idx);

  return {
    valid: true,
    row: {
      question_text,
      options: raw.options,
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
