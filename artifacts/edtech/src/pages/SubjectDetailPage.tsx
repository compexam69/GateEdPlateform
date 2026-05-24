import { AppLayout } from "@/components/layout/AppLayout";
import { useGetSubject, getGetSubjectQueryKey, useGetChapters, getGetChaptersQueryKey } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { BookOpen, ChevronRight, ArrowLeft, Lock, CheckCircle, BookMarked } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export default function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();

  const { data: subject, isLoading: subjectLoading } = useGetSubject(subjectId!, {
    query: { enabled: !!subjectId, queryKey: getGetSubjectQueryKey(subjectId!) }
  });

  const { data: chapters = [], isLoading: chaptersLoading } = useGetChapters(subjectId!, {
    query: { enabled: !!subjectId, queryKey: getGetChaptersQueryKey(subjectId!) }
  });

  const { data: chapterProgress = [] } = useQuery({
    queryKey: ["chapter-progress-bulk", subjectId, user?.id],
    queryFn: async () => {
      if (!user?.id || !chapters || chapters.length === 0) return [];
      const chapterIds = chapters.map((c: { id: string }) => c.id);
      const { data } = await supabase
        .from("user_chapter_progress")
        .select("chapter_id, all_topics_complete, chapter_test_attempted, chapter_test_passed, pdf_upload_unlocked")
        .eq("user_id", user.id)
        .in("chapter_id", chapterIds);
      return data ?? [];
    },
    enabled: !!user?.id && !!chapters && chapters.length > 0,
  });

  const { data: topicCounts = {} } = useQuery<Record<string, { total: number; complete: number }>>({
    queryKey: ["topic-counts-by-chapter", subjectId, user?.id],
    queryFn: async () => {
      if (!chapters || chapters.length === 0) return {};
      const chapterIds = chapters.map((c: { id: string }) => c.id);

      const { data: allTopics } = await supabase
        .from("topics")
        .select("id, chapter_id")
        .in("chapter_id", chapterIds)
        .eq("is_active", true);

      const { data: completedTopics } = await supabase
        .from("user_topic_progress")
        .select("topic_id, topics!inner(chapter_id)")
        .eq("user_id", user!.id)
        .eq("topic_complete", true)
        .in("topics.chapter_id", chapterIds);

      const counts: Record<string, { total: number; complete: number }> = {};
      for (const t of (allTopics ?? [])) {
        if (!counts[t.chapter_id]) counts[t.chapter_id] = { total: 0, complete: 0 };
        counts[t.chapter_id].total++;
      }
      for (const t of (completedTopics ?? [])) {
        const topicsData = t.topics as { chapter_id: string } | { chapter_id: string }[];
        const cid = Array.isArray(topicsData) ? topicsData[0]?.chapter_id : topicsData.chapter_id;
        if (!cid) continue;
        if (!counts[cid]) counts[cid] = { total: 0, complete: 0 };
        counts[cid].complete++;
      }
      return counts;
    },
    enabled: !!user?.id && !!chapters && chapters.length > 0,
  });

  const isLoading = subjectLoading || chaptersLoading;

  const progressMap = new Map(
    (chapterProgress as Array<{
      chapter_id: string;
      all_topics_complete: boolean;
      chapter_test_attempted: boolean;
      chapter_test_passed: boolean;
      pdf_upload_unlocked: boolean;
    }>).map(p => [p.chapter_id, p])
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/subjects">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{subject?.title || "Subject"}</h1>
            <p className="text-muted-foreground mt-1">{subject?.description || "Select a chapter to continue"}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : chapters.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No chapters available yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {chapters.map((chapter: { id: string; title: string; description?: string }, idx: number) => {
              const prog = progressMap.get(chapter.id);
              const counts = topicCounts[chapter.id] ?? { total: 0, complete: 0 };
              const isComplete = prog?.all_topics_complete && prog?.chapter_test_passed;
              const hasProgress = counts.complete > 0;
              const pct = counts.total > 0 ? Math.round((counts.complete / counts.total) * 100) : 0;

              return (
                <Link key={chapter.id} href={`/chapters/${chapter.id}`}>
                  <Card className="hover:border-primary transition-colors cursor-pointer bg-card group">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          isComplete
                            ? "bg-success/10 text-success"
                            : hasProgress
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary/10 text-secondary"
                        }`}>
                          {isComplete
                            ? <CheckCircle className="w-5 h-5" />
                            : hasProgress
                            ? <BookMarked className="w-5 h-5" />
                            : <span className="font-bold text-sm">{idx + 1}</span>}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{chapter.title}</h3>
                            {isComplete && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-success/40 text-success bg-success/5">
                                Complete
                              </Badge>
                            )}
                            {prog?.chapter_test_attempted && !prog?.chapter_test_passed && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-warning/40 text-warning bg-warning/5">
                                Test Attempted
                              </Badge>
                            )}
                            {prog?.pdf_upload_unlocked && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-accent/40 text-accent bg-accent/5">
                                Notes Unlocked
                              </Badge>
                            )}
                          </div>

                          {chapter.description && (
                            <p className="text-sm text-muted-foreground truncate mt-0.5">{chapter.description}</p>
                          )}

                          {counts.total > 0 && (
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{counts.complete}/{counts.total} topics complete</span>
                                <span>{pct}%</span>
                              </div>
                              <Progress value={pct} className="h-1.5" />
                            </div>
                          )}
                        </div>

                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-2" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
