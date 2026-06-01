import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { isValidUuid } from "../lib/sanitize";

const router = Router();

const VALID_STEPS = ["lecture", "lecture_quiz", "dpp", "pyqs", "topic_test"] as const;

router.post("/gate/check", requireAuth, async (req: AuthRequest, res) => {
  const { topic_id, step } = req.body as { topic_id: string; step: string };
  const userId = req.user!.id;

  if (!topic_id || !step) {
    res.status(400).json({ error: "topic_id and step required" });
    return;
  }
  if (!isValidUuid(topic_id)) {
    res.status(400).json({ error: "Invalid topic_id" });
    return;
  }
  if (!VALID_STEPS.includes(step as typeof VALID_STEPS[number])) {
    res.status(400).json({ error: `step must be one of: ${VALID_STEPS.join(", ")}` });
    return;
  }

  // lecture is always unlocked
  if (step === "lecture") {
    res.json({ allowed: true, reason: null });
    return;
  }

  const { data: progress } = await supabase
    .from("user_topic_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("topic_id", topic_id)
    .maybeSingle();

  const p = progress ?? {};

  let allowed = false;
  let reason = null;

  switch (step) {
    case "lecture_quiz":
      allowed = p["lecture_clicked"] === true;
      if (!allowed) reason = "Watch the lecture first";
      break;
    case "dpp":
      allowed = p["lecture_quiz_passed"] === true;
      if (!allowed) reason = "Pass the Lecture Quiz first";
      break;
    case "pyqs":
      allowed = p["dpp_completed"] === true;
      if (!allowed) reason = "Complete the DPP first";
      break;
    case "topic_test":
      allowed = p["pyqs_completed"] === true;
      if (!allowed) reason = "Complete the PYQs first";
      break;
  }

  if (!allowed) {
    res.status(403).json({ allowed: false, reason });
    return;
  }
  res.json({ allowed: true, reason: null });
});

router.get("/progress/topic/:topicId", requireAuth, async (req: AuthRequest, res) => {
  const topicId = req.params["topicId"] as string;
  if (!isValidUuid(topicId)) { res.status(400).json({ error: "Invalid topic ID" }); return; }

  const userId = req.user!.id;
  const { data, error } = await supabase
    .from("user_topic_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("topic_id", topicId)
    .maybeSingle();

  if (error) { res.status(500).json({ error: error.message }); return; }

  const p = data ?? {
    topic_id: topicId,
    lecture_clicked: false,
    lecture_quiz_passed: false,
    lecture_quiz_score: null,
    dpp_completed: false,
    dpp_score: null,
    pyqs_completed: false,
    pyqs_score: null,
    topic_test_passed: false,
    topic_test_score: null,
    topic_complete: false,
  };
  res.json(p);
});

router.post("/progress/lecture-click", requireAuth, async (req: AuthRequest, res) => {
  const { lecture_id, topic_id } = req.body as { lecture_id: string; topic_id: string };
  const userId = req.user!.id;

  if (!lecture_id || !isValidUuid(lecture_id)) {
    res.status(400).json({ error: "Valid lecture_id is required" });
    return;
  }
  if (!topic_id || !isValidUuid(topic_id)) {
    res.status(400).json({ error: "Valid topic_id is required" });
    return;
  }

  await supabase.from("lecture_clicks").insert({ user_id: userId, lecture_id, clicked_at: new Date().toISOString() });

  await supabase
    .from("user_topic_progress")
    .upsert({ user_id: userId, topic_id, lecture_clicked: true, updated_at: new Date().toISOString() }, { onConflict: "user_id,topic_id" });

  res.json({ message: "Recorded" });
});

export default router;
