import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { ArrowLeft, Lock, CheckCircle, ChevronRight, PlayCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { getTopics, getGetTopicsUrl } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export default function ChapterDetailPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const { user } = useAuth();

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
      const { data } = await supabase.from("chapters").select("title, description").eq("id", chapterId!).single();
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

  const topicsWithStatus = (topics ?? []).map((topic: { id: string; title: string }, idx: number) => {
    const isCompleted = completedSet.has(topic.id);
    const prevCompleted = idx === 0 ? true : completedSet.has((topics ?? [])[idx - 1]?.id);
    const isUnlocked = isCompleted || prevCompleted;
    const isLocked = !isUnlocked;
    return { ...topic, isCompleted, isLocked, isUnlocked };
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{chapter?.title || "Chapter Topics"}</h1>
            <p className="text-muted-foreground mt-1">
              {chapter?.description || "Complete topics in order to unlock the next one."}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : topicsWithStatus.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
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
                        {topic.isCompleted && " • Completed"}
                        {topic.isLocked && " • Complete previous topic first"}
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
