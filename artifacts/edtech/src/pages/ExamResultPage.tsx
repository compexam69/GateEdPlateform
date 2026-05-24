import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, ArrowLeft, Minus, Clock, Target, TrendingUp, QrCode } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { getExamResult, getGetExamResultUrl } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export default function ExamResultPage() {
  const { resultId } = useParams<{ resultId: string }>();

  const { data: result, isLoading } = useQuery({
    queryKey: [getGetExamResultUrl(resultId!), resultId],
    queryFn: () => getExamResult(resultId!),
    enabled: !!resultId,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!result) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Result not found.</p>
          <Button asChild className="mt-4"><Link href="/dashboard">Back to Dashboard</Link></Button>
        </div>
      </AppLayout>
    );
  }

  const correct = result.answers?.filter(a => a.is_correct).length ?? 0;
  const incorrect = result.answers?.filter(a => !a.is_correct && a.selected_option).length ?? 0;
  const skipped = result.answers?.filter(a => !a.selected_option).length ?? 0;
  const score = result.score ?? 0;
  const totalMarks = result.total_marks ?? 1;
  const accuracy = result.accuracy ?? 0;
  const timeTakenMs = result.time_taken_ms ?? 0;
  const negativeMarks = result.negative_marks_applied ?? 0;
  const passed = (result as { passed?: boolean }).passed ?? (accuracy >= 60);
  const scorePercent = Math.round((score / totalMarks) * 100);
  const timeTakenMin = Math.round(timeTakenMs / 60000);

  const chartData = [
    { name: "Correct", value: correct, color: "hsl(var(--success))" },
    { name: "Incorrect", value: incorrect, color: "hsl(var(--destructive))" },
    { name: "Skipped", value: skipped, color: "hsl(var(--muted-foreground))" },
  ].filter(d => d.value > 0);

  const answers = (result.answers ?? []) as Array<{
    question_id: string;
    selected_option: string | null;
    correct_answer?: string;
    is_correct: boolean;
    time_spent_ms?: number;
    explanation?: string;
    video_solution_url?: string;
    qr_code_url?: string;
    quiz_questions?: {
      question_text?: string;
      options?: Record<string, string>;
      correct_answer?: string;
      explanation?: string;
      video_solution_url?: string;
      qr_code_url?: string;
    };
  }>;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">Exam Results</h1>
          </div>
          <Badge variant={passed ? "default" : "destructive"} className={`text-base px-4 py-1 ${passed ? "bg-success text-success-foreground" : ""}`}>
            {passed ? "PASSED" : "FAILED"}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-card col-span-2 md:col-span-1">
            <CardContent className="p-4 text-center">
              <div className={`text-4xl font-bold ${passed ? "text-success" : "text-destructive"}`}>{scorePercent}%</div>
              <p className="text-sm text-muted-foreground mt-1">Score ({score}/{totalMarks})</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold">
                <Target className="w-5 h-5 text-primary" />{accuracy.toFixed(1)}%
              </div>
              <p className="text-sm text-muted-foreground mt-1">Accuracy</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold">
                <Clock className="w-5 h-5 text-secondary" />{timeTakenMin}m
              </div>
              <p className="text-sm text-muted-foreground mt-1">Time Taken</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-destructive">
                <TrendingUp className="w-5 h-5" />-{negativeMarks.toFixed(1)}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Negative Marks</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-card">
            <CardHeader><CardTitle>Accuracy Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-around mt-2 text-sm">
                <div className="flex items-center gap-1.5 text-success"><CheckCircle className="w-4 h-4" />{correct} Correct</div>
                <div className="flex items-center gap-1.5 text-destructive"><XCircle className="w-4 h-4" />{incorrect} Wrong</div>
                <div className="flex items-center gap-1.5 text-muted-foreground"><Minus className="w-4 h-4" />{skipped} Skipped</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader><CardTitle>Quick Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Questions</span><span className="font-medium">{correct + incorrect + skipped}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Correct Answers</span><span className="font-medium text-success">{correct}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Wrong Answers</span><span className="font-medium text-destructive">{incorrect}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Skipped</span><span className="font-medium text-muted-foreground">{skipped}</span></div>
              <div className="border-t border-border pt-3 flex justify-between text-sm"><span className="text-muted-foreground">Final Score</span><span className="font-bold text-primary">{score} / {totalMarks}</span></div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="answers">
          <TabsList>
            <TabsTrigger value="answers">Answer Sheet</TabsTrigger>
            <TabsTrigger value="solutions">Solutions</TabsTrigger>
          </TabsList>

          <TabsContent value="answers" className="space-y-3 mt-4">
            {answers.map((ans, idx) => {
              const q = ans.quiz_questions;
              const isCorrect = ans.is_correct;
              const isSkipped = !ans.selected_option;
              return (
                <Card key={ans.question_id} className={`border-l-4 ${isCorrect ? "border-l-success" : isSkipped ? "border-l-muted-foreground" : "border-l-destructive"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-sm flex-1">{idx + 1}. {q?.question_text || "Question"}</p>
                      {isCorrect
                        ? <span className="text-success flex items-center gap-1 text-xs shrink-0"><CheckCircle className="w-3.5 h-3.5" />Correct</span>
                        : isSkipped
                        ? <span className="text-muted-foreground flex items-center gap-1 text-xs shrink-0"><Minus className="w-3.5 h-3.5" />Skipped</span>
                        : <span className="text-destructive flex items-center gap-1 text-xs shrink-0"><XCircle className="w-3.5 h-3.5" />Wrong</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {ans.selected_option && <span>Your answer: <strong className={isCorrect ? "text-success" : "text-destructive"}>{ans.selected_option}</strong></span>}
                      {!isCorrect && (q?.correct_answer || ans.correct_answer) && (
                        <span>Correct: <strong className="text-success">{q?.correct_answer || ans.correct_answer}</strong></span>
                      )}
                      {ans.time_spent_ms ? <span><Clock className="w-3 h-3 inline" /> {Math.round(ans.time_spent_ms / 1000)}s</span> : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="solutions" className="space-y-3 mt-4">
            {answers.map((ans, idx) => {
              const q = ans.quiz_questions;
              const explanation = q?.explanation || ans.explanation;
              const videoUrl = q?.video_solution_url || ans.video_solution_url;
              const qrUrl = q?.qr_code_url || ans.qr_code_url;
              return (
                <Card key={ans.question_id} className="bg-card">
                  <CardContent className="p-4 space-y-2">
                    <p className="font-medium text-sm">{idx + 1}. {q?.question_text || "Question"}</p>
                    {explanation ? (
                      <p className="text-sm text-muted-foreground">{explanation}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No explanation available.</p>
                    )}
                    {(videoUrl || qrUrl) && (
                      <div className="flex items-center gap-3 pt-1">
                        {videoUrl && (
                          <Button variant="link" size="sm" className="text-primary p-0 h-auto" asChild>
                            <a href={videoUrl} target="_blank" rel="noopener noreferrer">Watch Video Solution</a>
                          </Button>
                        )}
                        {qrUrl && (
                          <a href={qrUrl} target="_blank" rel="noopener noreferrer" title="Scan QR">
                            <QrCode className="w-6 h-6 text-muted-foreground hover:text-primary" />
                          </a>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
