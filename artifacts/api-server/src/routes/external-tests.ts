import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

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

router.post("/external-tests", requireAuth, async (req: AuthRequest, res) => {
  const { exam_name, exam_date, score_obtained, total_marks, percentile, rank, notes } = req.body;
  if (!exam_name || !exam_date || score_obtained === undefined || !total_marks) {
    res.status(400).json({ error: "exam_name, exam_date, score_obtained, total_marks required" });
    return;
  }
  const { data, error } = await supabase
    .from("external_tests")
    .insert({ user_id: req.user!.id, exam_name, exam_date, score_obtained, total_marks, percentile, rank, notes })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.delete("/external-tests/:testId", requireAuth, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("external_tests")
    .delete()
    .eq("id", req.params["testId"])
    .eq("user_id", req.user!.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Deleted" });
});

export default router;
