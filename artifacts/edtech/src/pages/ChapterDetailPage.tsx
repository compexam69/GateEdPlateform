import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link, useLocation } from "wouter";
import { ArrowLeft, Lock, CheckCircle, ChevronRight, PlayCircle, Trophy, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { getTopics, getGetTopicsUrl } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export default function ChapterDetailPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: topics, isLoading: topicsLoading } = useQuery({
    queryKey: [getGetTopicsUrl(chapterId!), chapterId],
    queryFn: () => getTopics(chapterId!),
    enabled: !!chapterId,
  });

  const { data: progressRows, isLoading: progressLoading } = useQuery({
    queryKey: ["topic-progress-bulk", chapterId, user?.id],
    queryFn: async () => {
      if (!user?.id || !topics) return [];
      const topicIds = topics.map((t: { id: string }) => t.id);
      if (topicIds.length === 0) return [];
      const { data } = await supabase
        .from("user_topic_progress")
        .select("topic_id, topic_complete")
        .eq("user_id", user.id)
        .in("topic_id", topicIds);
      return data ?? [];
    },
    enabled: !!user?.id && !!topics && topics.length > 0,
  });

  const { data: chapter } = useQuery({
    queryKey: ["chapter", chapterId],
    queryFn: async () => {
      const { data } = await supabase.from("chapters").select("title, description, subject_id").eq("id", chapterId!).single();
      return data;
    },
    enabled: !!chapterId,
  });

  const { data: chapterProgress } = useQuery({
    queryKey: ["chapter-progress", chapterId, user?.id],
    queryFn: async () => {
      if (!user?.id || !chapterId) return null;
      const { data } = await supabase
        .from("user_chapter_progress")
        .select("all_topics_complete, chapter_test_attempted, chapter_test_passed, pdf_upload_unlocked")
        .eq("user_id", user.id)
        .eq("chapter_id", chapterId)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id && !!chapterId,
  });

  const { data: chapterTest } = useQuery({
    queryKey: ["chapter-test", chapterId],
    queryFn: async () => {
      if (!chapterId) return null;
      const { data } = await supabase
        .from("quizzes")
        .select("id, title, passing_score, duration_minutes")
        .eq("chapter_id", chapterId)
        .eq("type", "chapter_test")
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
    enabled: !!chapterId,
  });

  const isLoading = topicsLoading || progressLoading;

  const completedSet = new Set(
    (progressRows ?? [])
      .filter((p: { topic_complete: boolean; topic_id: string }) => p.topic_complete)
      .map((p: { topic_complete: boolean; topic_id: string }) => p.topic_id)
  );

  const topicsWithStatus = (topics as Array<{ id: string; title: string }> ?? []).map((topic, idx: number) => {
    const isCompleted = completedSet.has(topic.id);
    const prevCompleted = idx === 0 ? true : completedSet.has((topics ?? [])[idx - 1]?.id);
    const isUnlocked = isCompleted || prevCompleted;
    const isLocked = !isUnlocked;
    return { ...topic, isCompleted, isLocked, isUnlocked };
  });

  const allTopicsComplete = topics && topics.length > 0 && completedSet.size >= topics.length;
  const chapterTestUnlocked = allTopicsComplete || chapterProgress?.all_topics_complete;
  const chapterTestPassed = chapterProgress?.chapter_test_passed;
  const chapterTestAttempted = chapterProgress?.chapter_test_attempted;
  const pdfUnlocked = chapterProgress?.pdf_upload_unlocked;

  const completionPct = topics && topics.length > 0
    ? Math.round((completedSet.size / topics.length) * 100)
    : 0;

  function handleStartChapterTest() {
    if (!chapterTest) {
      toast({ title: "No chapter test available", description: "Ask your admin to create a Chapter Test for this chapter.", variant: "destructive" });
      return;
    }
    setLocation(`/exam/${chapterTest.id}`);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">{chapter?.title || "Chapter Topics"}</h1>
            <p className="text-muted-foreground mt-1">
              {chapter?.description || "Complete topics in order to unlock the next one."}
            </p>
          </div>
        </div>

        {/* Progress summary */}
        {topics && topics.length > 0 && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <span className="shrink-0 tabular-nums">{completedSet.size}/{topics.length} topics</span>
          </div>
        )}

        {/* Chapter Test Card */}
        {chapterTestUnlocked && (
          <Card className={`border-2 ${chapterTestPassed ? "border-success/40 bg-success/5" : "border-primary/40 bg-primary/5"}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${chapterTestPassed ? "bg-success/20 text-success" : "bg-primary/20 text-primary"}`}>
                  <Trophy className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">Chapter Test</h3>
                    {chapterTestPassed && (
                      <Badge className="bg-success/10 text-success border-success/20 text-xs">Passed</Badge>
                    )}
                    {chapterTestAttempted && !chapterTestPassed && (
                      <Badge className="bg-warning/10 text-warning border-warning/20 text-xs">Attempted</Badge>
                    )}
                    {pdfUnlocked && (
                      <Badge className="bg-accent/10 text-accent border-accent/20 text-xs">Notes Upload Unlocked</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {chapterTestPassed
                      ? "You have passed the Chapter Test."
                      : chapterTestAttempted
                      ? "Retake the Chapter Test to improve your score."
                      : "All topics complete! Take the Chapter Test to unlock PDF notes upload."}
                  </p>
                </div>
                <Button
                  onClick={handleStartChapterTest}
                  variant={chapterTestPassed ? "outline" : "default"}
                  className="shrink-0"
                >
                  {chapterTestPassed ? "Retake" : chapterTestAttempted ? "Retry" : "Start Test"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Locked chapter test hint */}
        {!chapterTestUnlocked && topics && topics.length > 0 && (
          <Card className="border border-dashed border-muted-foreground/30 bg-muted/20">
            <CardContent className="p-4 flex items-center gap-3">
              <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">
                Complete all {topics.length} topics to unlock the Chapter Test.
              </p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : topicsWithStatus.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No topics in this chapter yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {topicsWithStatus.map((topic, idx) => (
              <Card
                key={topic.id}
                className={`bg-card transition-colors ${
                  topic.isLocked
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:border-primary cursor-pointer group"
                }`}
              >
                <Link href={topic.isLocked ? "#" : `/topics/${topic.id}`}>
                  <CardContent className="p-4 flex items-center space-x-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        topic.isCompleted
                          ? "bg-success/10 text-success"
                          : topic.isLocked
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {topic.isCompleted ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : topic.isLocked ? (
                        <Lock className="w-5 h-5" />
                      ) : (
                        <PlayCircle className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{topic.title}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Topic {idx + 1}
                        {topic.isCompleted && " · Completed"}
                        {topic.isLocked && " · Complete previous topic first"}
                      </p>
                    </div>
                    {!topic.isLocked && (
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    )}
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
