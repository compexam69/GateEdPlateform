import { AppLayout } from "@/components/layout/AppLayout";
import { useGetSubjects, getGetSubjectsQueryKey } from "@workspace/api-client-react";
import type { Subject } from "@workspace/api-client-react";
import { Link } from "wouter";
import { BookOpen, ChevronRight, Lock, Trophy, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface SubjectProgress {
  subject_id: string;
  subject_test_passed: boolean | null;
  all_chapters_complete: boolean | null;
}

interface GrandTestQuiz {
  id: string;
  title: string;
  type: string;
  duration_minutes: number | null;
  passing_score: number | null;
}

export default function SubjectsPage() {
  const { user } = useAuth();
  const { data: subjects, isLoading } = useGetSubjects({
    query: { queryKey: getGetSubjectsQueryKey() }
  });

  const totalSubjects = subjects?.length ?? 0;

  const { data: subjectProgress = [] } = useQuery<SubjectProgress[]>({
    queryKey: ["user-subject-progress", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("user_subject_progress")
        .select("subject_id, subject_test_passed, all_chapters_complete")
        .eq("user_id", user.id);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: grandTestQuizzes = [] } = useQuery<GrandTestQuiz[]>({
    queryKey: ["grand-test-quizzes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quizzes")
        .select("id, title, type, duration_minutes, passing_score")
        .in("type", ["grand_test"])
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const passedSubjectCount = subjectProgress.filter(p => p.subject_test_passed).length;
  const allSubjectsPassed = totalSubjects > 0 && passedSubjectCount >= totalSubjects;
  const multiSubjectUnlocked = passedSubjectCount >= 2;

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Learning Path</h1>
          <p className="text-muted-foreground mt-2">Select a subject to begin your mastery journey.</p>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {subjects?.map((subject: Subject) => {
              const prog = subjectProgress.find(p => p.subject_id === subject.id);
              const isPassed = !!prog?.subject_test_passed;
              return (
                <Link key={subject.id} href={`/subjects/${subject.id}`}>
                  <Card className="hover:border-primary transition-colors cursor-pointer bg-card group h-full">
                    <CardContent className="p-6 flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <BookOpen className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg truncate">{subject.title}</h3>
                          {isPassed && (
                            <Badge variant="outline" className="text-[10px] shrink-0 border-success text-success">
                              Mastered
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {subject.description || "Start learning " + subject.title}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* Advanced Tests Section */}
        {totalSubjects > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-warning" />
              <h2 className="text-xl font-bold">Advanced Tests</h2>
              {passedSubjectCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  ({passedSubjectCount}/{totalSubjects} subjects mastered)
                </span>
              )}
            </div>

            {/* Multi-Subject gate notice */}
            {!multiSubjectUnlocked && (
              <Card className="border-dashed bg-card/50">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Multi-Subject &amp; Grand Tests</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pass subject tests for at least 2 subjects to unlock multi-subject practice tests.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {multiSubjectUnlocked && grandTestQuizzes.length === 0 && (
              <Card className="border-dashed bg-card/50">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Grand Tests Available Soon</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You've unlocked advanced testing! Grand Tests will appear here once your admin publishes them.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {multiSubjectUnlocked && grandTestQuizzes.map((quiz) => {
              const isUnlocked = quiz.type === "grand_test" ? allSubjectsPassed : multiSubjectUnlocked;
              return (
                <div key={quiz.id}>
                  {isUnlocked ? (
                    <Link href={`/exam/${quiz.id}`}>
                      <Card className="hover:border-warning transition-colors cursor-pointer bg-card group border-warning/30">
                        <CardContent className="p-5 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0 group-hover:bg-warning/20 transition-colors">
                            <Trophy className="w-5 h-5 text-warning" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold truncate">{quiz.title}</p>
                              <Badge variant="outline" className="text-[10px] border-warning text-warning shrink-0">
                                {quiz.type === "grand_test" ? "Grand Test" : "Multi-Subject"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {quiz.duration_minutes ? `${quiz.duration_minutes} min` : "No time limit"}
                              {quiz.passing_score ? ` · Pass: ${quiz.passing_score}%` : ""}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-warning transition-colors" />
                        </CardContent>
                      </Card>
                    </Link>
                  ) : (
                    <Card className="border-dashed bg-card/50 opacity-60 cursor-not-allowed">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <Lock className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{quiz.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Complete all subject tests to unlock this Grand Test.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
