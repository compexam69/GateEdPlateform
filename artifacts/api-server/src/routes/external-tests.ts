import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { capText, isValidUuid, MAX } from "../lib/sanitize";

const router = Router();

router.get("/external-tests", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("external_tests")
    .select("*")
    .eq("user_id", req.user!.id)
    .order("exam_date", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

function validateExternalTestBody(body: Record<string, unknown>): {
  exam_name: string;
  exam_date: string;
  score_obtained: number;
  total_marks: number;
  percentile: number | null;
  rank: number | null;
  notes: string | null;
} | { error: string } {
  const exam_name = capText(body["exam_name"], MAX.TITLE);
  if (!exam_name) return { error: "exam_name is required" };

  const rawDate = body["exam_date"];
  if (!rawDate || isNaN(Date.parse(String(rawDate)))) {
    return { error: "exam_date must be a valid date" };
  }
  const exam_date = new Date(String(rawDate)).toISOString().split("T")[0];

  const score_obtained = Number(body["score_obtained"]);
  if (!Number.isFinite(score_obtained)) return { error: "score_obtained must be a number" };

  const total_marks = Number(body["total_marks"]);
  if (!Number.isFinite(total_marks) || total_marks <= 0) {
    return { error: "total_marks must be greater than 0" };
  }

  if (score_obtained > total_marks) {
    return { error: "score_obtained cannot exceed total_marks" };
  }

  const percentile = body["percentile"] != null ? Number(body["percentile"]) : null;
  if (percentile !== null && (!Number.isFinite(percentile) || percentile < 0 || percentile > 100)) {
    return { error: "percentile must be between 0 and 100" };
  }

  const rank = body["rank"] != null ? Math.floor(Number(body["rank"])) : null;
  if (rank !== null && (!Number.isFinite(rank) || rank < 1)) {
    return { error: "rank must be a positive integer" };
  }

  const notes = capText(body["notes"], 2000);

  return { exam_name, exam_date, score_obtained, total_marks, percentile, rank, notes };
}

router.post("/external-tests", requireAuth, async (req: AuthRequest, res) => {
  const validated = validateExternalTestBody(req.body as Record<string, unknown>);
  if ("error" in validated) { res.status(400).json({ error: validated.error }); return; }

  const { data, error } = await supabase
    .from("external_tests")
    .insert({ user_id: req.user!.id, ...validated })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch("/external-tests/:testId", requireAuth, async (req: AuthRequest, res) => {
  const testId = req.params["testId"] as string;
  if (!isValidUuid(testId)) { res.status(400).json({ error: "Invalid test ID" }); return; }

  const validated = validateExternalTestBody(req.body as Record<string, unknown>);
  if ("error" in validated) { res.status(400).json({ error: validated.error }); return; }

  const { data, error } = await supabase
    .from("external_tests")
    .update(validated)
    .eq("id", testId)
    .eq("user_id", req.user!.id)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data) { res.status(404).json({ error: "Test not found" }); return; }
  res.json(data);
});

router.delete("/external-tests/:testId", requireAuth, async (req: AuthRequest, res) => {
  const testId = req.params["testId"] as string;
  if (!isValidUuid(testId)) { res.status(400).json({ error: "Invalid test ID" }); return; }

  const { error } = await supabase
    .from("external_tests")
    .delete()
    .eq("id", testId)
    .eq("user_id", req.user!.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Deleted" });
});

export default router;
