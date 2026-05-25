import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, PlayCircle, FileText, CheckSquare, Target, Lock, CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTopicProgress, getGetTopicProgressUrl, useRecordLectureClick } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface TopicStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  quizType: string;
  isAlwaysUnlocked: boolean;
  isUnlocked: (progress: Record<string, unknown>) => boolean;
  action: string;
}

const STEPS: TopicStep[] = [
  {
    id: "lecture",
    title: "Watch Lecture",
    description: "Open the Telegram lecture video for this topic.",
    icon: PlayCircle,
    quizType: "",
    isAlwaysUnlocked: true,
    isUnlocked: () => true,
    action: "Open in Telegram",
  },
  {
    id: "lecture_quiz",
    title: "Lecture Quiz",
    description: "Test your understanding of the lecture material.",
    icon: CheckSquare,
    quizType: "lecture_quiz",
    isAlwaysUnlocked: false,
    isUnlocked: (p) => !!(p["lecture_clicked"]),
    action: "Start Quiz",
  },
  {
    id: "dpp",
    title: "Daily Practice Problems",
    description: "Solve DPPs to reinforce your concept mastery.",
    icon: FileText,
    quizType: "dpp",
    isAlwaysUnlocked: false,
    isUnlocked: (p) => !!(p["lecture_quiz_passed"]),
    action: "Start DPP",
  },
  {
    id: "pyqs",
    title: "Previous Year Questions",
    description: "Practice PYQs from JEE/NEET/GATE on this topic.",
    icon: Target,
    quizType: "pyqs",
    isAlwaysUnlocked: false,
    isUnlocked: (p) => !!(p["dpp_completed"]),
    action: "Start PYQs",
  },
  {
    id: "topic_test",
    title: "Topic Test",
    description: "Final test — pass this to mark the topic complete!",
    icon: CheckSquare,
    quizType: "topic_test",
    isAlwaysUnlocked: false,
    isUnlocked: (p) => !!(p["pyqs_completed"]),
    action: "Start Test",
  },
];

export default function TopicDetailPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: topic } = useQuery({
    queryKey: ["topic-detail", topicId],
    queryFn: async () => {
      const { data } = await supabase
        .from("topics")
        .select("*, lectures(*), chapters(title, subject_id)")
        .eq("id", topicId!)
        .single();
      return data;
    },
    enabled: !!topicId,
  });

  const { data: progress, isLoading: progressLoading } = useQuery({
    queryKey: [getGetTopicProgressUrl(topicId!), topicId],
    queryFn: () => getTopicProgress(topicId!),
    enabled: !!topicId,
  });

  const { data: quizzes } = useQuery({
    queryKey: ["topic-quizzes", topicId],
    queryFn: async () => {
      const { data } = await supabase
        .from("quizzes")
        .select("id, type")
        .eq("topic_id", topicId!)
        .eq("is_active", true);
      return data ?? [];
    },
    enabled: !!topicId,
  });

  const recordClick = useRecordLectureClick();

  const getQuizId = (quizType: string) => {
    return quizzes?.find((q: { type: string }) => q.type === quizType)?.id ?? null;
  };

  const getTelegramLink = () => {
    const lecture = topic?.lectures?.[0];
    if (!lecture?.telegram_chat_id || !lecture?.telegram_message_id) return null;
    return `https://t.me/c/${lecture.telegram_chat_id}/${lecture.telegram_message_id}`;
  };

  async function handleLectureClick() {
    const link = getTelegramLink();
    const lecture = topic?.lectures?.[0];
    if (!lecture) {
      toast({ title: "No lecture", description: "Lecture link not configured yet.", variant: "destructive" });
      return;
    }
    try {
      await recordClick.mutateAsync({ data: { lecture_id: lecture.id, topic_id: topicId! } });
      queryClient.invalidateQueries({ queryKey: [getGetTopicProgressUrl(topicId!), topicId] });
    } catch {}
    if (link) window.open(link, "_blank");
  }

  async function handleStepClick(step: TopicStep) {
    if (step.id === "lecture") {
      handleLectureClick();
      return;
    }
    const quizId = getQuizId(step.quizType);
    if (!quizId) {
      toast({ title: "Not available", description: "This quiz hasn't been set up yet.", variant: "destructive" });
      return;
    }
    setLocation(`/exam/${quizId}`);
  }

  const p = (progress ?? {}) as Record<string, unknown>;

  const stepsWithStatus = STEPS.map(step => {
    const completed = (() => {
      switch (step.id) {
        case "lecture": return !!(p["lecture_clicked"]);
        case "lecture_quiz": return !!(p["lecture_quiz_passed"]);
        case "dpp": return !!(p["dpp_completed"]);
        case "pyqs": return !!(p["pyqs_completed"]);
        case "topic_test": return !!(p["topic_test_passed"]);
        default: return false;
      }
    })();
    const unlocked = step.isAlwaysUnlocked || step.isUnlocked(p);
    return { ...step, completed, unlocked, locked: !unlocked };
  });

  const topicComplete = !!(p["topic_complete"]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{topic?.title || "Topic"}</h1>
              {topicComplete && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 text-success text-xs sm:text-sm font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Completed
                </div>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {topic?.description || "Complete each step in order to master this topic."}
            </p>
          </div>
        </div>

        {progressLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            {stepsWithStatus.map((step, idx) => {
              const Icon = step.icon;
              return (
                <Card
                  key={step.id}
                  className={`bg-card transition-all ${step.locked ? "opacity-60" : ""}`}
                >
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                      step.completed
                        ? "bg-success/10 text-success"
                        : step.locked
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary"
                    }`}>
                      {step.completed
                        ? <CheckCircle2 className="w-6 h-6" />
                        : step.locked
                        ? <Lock className="w-5 h-5" />
                        : <Icon className="w-6 h-6" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-muted-foreground mb-0.5">Step {idx + 1}</div>
                      <h3 className="font-semibold text-base">{step.title}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
                    </div>

                    <div className="shrink-0">
                      {step.locked ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-md border border-border">
                          <Lock className="w-3 h-3" /> Locked
                        </div>
                      ) : step.id === "lecture" ? (
                        <Button
                          variant={step.completed ? "outline" : "default"}
                          size="sm"
                          onClick={handleLectureClick}
                          className={step.completed ? "border-success text-success hover:bg-success/10" : ""}
                        >
                          <ExternalLink className="w-4 h-4 mr-1.5" />
                          {step.completed ? "Rewatch" : step.action}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={step.completed ? "outline" : "default"}
                          onClick={() => handleStepClick(step)}
                          className={step.completed ? "border-success text-success hover:bg-success/10" : ""}
                        >
                          {step.completed ? "Redo" : step.action}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
