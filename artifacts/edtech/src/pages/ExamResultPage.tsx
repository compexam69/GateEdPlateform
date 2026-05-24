import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, ArrowLeft, Minus, Clock, Target, TrendingUp, QrCode, Youtube, Lightbulb, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { getExamResult, getGetExamResultUrl } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export default function ExamResultPage() {
  const { resultId } = useParams<{ resultId: string }>();
  const [answerFilter, setAnswerFilter] = useState<"all" | "incorrect" | "skipped">("all");

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

  const correct = result.answers?.filter((a: unknown) => (a as { is_correct: boolean }).is_correct).length ?? 0;
  const incorrect = result.answers?.filter((a: unknown) => { const r = a as { is_correct: boolean; selected_option?: string | null }; return !r.is_correct && r.selected_option; }).length ?? 0;
  const skipped = result.answers?.filter((a: unknown) => !(a as { selected_option?: string | null }).selected_option).length ?? 0;
  const score = result.score ?? 0;
  const totalMarks = result.total_marks ?? 1;
  const accuracy = result.accuracy ?? 0;
  const timeTakenMs = result.time_taken_ms ?? 0;
  const negativeMarks = result.negative_marks_applied ?? 0;
  const passed = (result as { passed?: boolean }).passed ?? (accuracy >= 60);
  const scorePercent = Math.round((score / totalMarks) * 100);
  const timeTakenMin = Math.round(timeTakenMs / 60000);

  const pieData = [
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

  // Insights: time analysis
  const withTime = answers.filter(a => (a.time_spent_ms ?? 0) > 0);
  const sorted = [...withTime].sort((a, b) => (b.time_spent_ms ?? 0) - (a.time_spent_ms ?? 0));
  const slowest = sorted.slice(0, 3);
  const fastest = [...withTime].sort((a, b) => (a.time_spent_ms ?? 0) - (b.time_spent_ms ?? 0)).slice(0, 3);
  const avgTimeMs = withTime.length ? withTime.reduce((s, a) => s + (a.time_spent_ms ?? 0), 0) / withTime.length : 0;

  // Time distribution bar chart
  const timeDistData = answers.map((a, i) => ({
    q: `Q${i + 1}`,
    time: Math.round((a.time_spent_ms ?? 0) / 1000),
    correct: a.is_correct,
  }));

  // Videos with links
  const withVideo = answers.filter(a => {
    const v = a.quiz_questions?.video_solution_url || a.video_solution_url;
    return !!v;
  });

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

        {/* Score Cards */}
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

        {/* Charts Row */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-card">
            <CardHeader><CardTitle>Accuracy Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
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
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Avg time / question</span><span className="font-medium">{Math.round(avgTimeMs / 1000)}s</span></div>
              <div className="border-t border-border pt-3 flex justify-between text-sm"><span className="text-muted-foreground">Final Score</span><span className="font-bold text-primary">{score} / {totalMarks}</span></div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="answers">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="answers">Answer Sheet</TabsTrigger>
            <TabsTrigger value="solutions">Solutions</TabsTrigger>
            <TabsTrigger value="videos">Videos</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          {/* Answer Sheet */}
          <TabsContent value="answers" className="space-y-3 mt-4">
            <div className="flex gap-2 flex-wrap">
              {(["all", "incorrect", "skipped"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setAnswerFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                    answerFilter === f
                      ? f === "all" ? "bg-primary text-primary-foreground border-primary"
                        : f === "incorrect" ? "bg-destructive text-destructive-foreground border-destructive"
                        : "bg-muted text-foreground border-muted-foreground"
                      : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                  }`}
                >
                  {f === "all" ? `All (${answers.length})` : f === "incorrect" ? `Incorrect (${incorrect})` : `Skipped (${skipped})`}
                </button>
              ))}
            </div>
            {answers
              .filter(ans => {
                if (answerFilter === "incorrect") return !ans.is_correct && !!ans.selected_option;
                if (answerFilter === "skipped") return !ans.selected_option;
                return true;
              })
              .map(ans => {
                const q = ans.quiz_questions;
                const isCorrect = ans.is_correct;
                const isSkipped = !ans.selected_option;
                const globalIdx = answers.indexOf(ans);
                return (
                  <Card key={ans.question_id} className={`border-l-4 ${isCorrect ? "border-l-success" : isSkipped ? "border-l-muted-foreground" : "border-l-destructive"}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-sm flex-1">{globalIdx + 1}. {q?.question_text || "Question"}</p>
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
            {answers.filter(ans => {
              if (answerFilter === "incorrect") return !ans.is_correct && !!ans.selected_option;
              if (answerFilter === "skipped") return !ans.selected_option;
              return true;
            }).length === 0 && (
              <p className="text-center text-muted-foreground py-6 text-sm">No questions match this filter.</p>
            )}
          </TabsContent>

          {/* Solutions */}
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
                          <a href={videoUrl || qrUrl} target="_blank" rel="noopener noreferrer" title="QR Code">
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

          {/* Videos Tab */}
          <TabsContent value="videos" className="mt-4">
            {withVideo.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <Youtube className="w-12 h-12 opacity-20" />
                <p className="text-sm">No video solutions available for this exam.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{withVideo.length} video solution{withVideo.length !== 1 ? "s" : ""} available</p>
                {withVideo.map(ans => {
                  const q = ans.quiz_questions;
                  const videoUrl = q?.video_solution_url || ans.video_solution_url || "";
                  const qrUrl = q?.qr_code_url || ans.qr_code_url;
                  const globalIdx = answers.indexOf(ans);

                  // Extract YouTube video ID
                  const ytMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
                  const ytId = ytMatch?.[1];
                  const embedUrl = ytId ? `https://www.youtube.com/embed/${ytId}` : null;

                  return (
                    <Card key={ans.question_id} className="bg-card overflow-hidden">
                      <CardContent className="p-4 space-y-3">
                        <p className="font-medium text-sm">Q{globalIdx + 1}: {q?.question_text || "Question"}</p>
                        {embedUrl ? (
                          <div className="aspect-video rounded-lg overflow-hidden bg-black">
                            <iframe
                              src={embedUrl}
                              title={`Solution Q${globalIdx + 1}`}
                              className="w-full h-full"
                              allowFullScreen
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            />
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" asChild>
                            <a href={videoUrl} target="_blank" rel="noopener noreferrer">
                              <Youtube className="w-4 h-4 mr-2 text-destructive" /> Open Video Solution
                            </a>
                          </Button>
                        )}
                        {qrUrl && (
                          <div className="flex items-center gap-3">
                            <img src={qrUrl} alt="QR Code" className="w-20 h-20 rounded bg-white p-1" />
                            <div>
                              <p className="text-xs font-medium">Scan QR to watch</p>
                              <p className="text-xs text-muted-foreground">Open on your phone</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-4 mt-4">
            {/* Performance Summary */}
            <div className="grid gap-3 md:grid-cols-3">
              <Card className={`bg-card border-l-4 ${passed ? "border-l-success" : "border-l-destructive"}`}>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold">{accuracy.toFixed(0)}%</p>
                  <p className="text-sm text-muted-foreground">Accuracy</p>
                  <p className={`text-xs mt-1 font-medium ${passed ? "text-success" : "text-destructive"}`}>
                    {passed ? "Above passing threshold" : "Below passing threshold"}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold">{Math.round(avgTimeMs / 1000)}s</p>
                  <p className="text-sm text-muted-foreground">Avg time / question</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    {avgTimeMs > 90000 ? "Slower than ideal" : avgTimeMs > 60000 ? "Moderate pace" : "Good speed"}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold">{skipped}</p>
                  <p className="text-sm text-muted-foreground">Questions skipped</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    {skipped === 0 ? "Attempted all questions" : `${Math.round((skipped / answers.length) * 100)}% left unattempted`}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Time per Question Chart */}
            {timeDistData.some(d => d.time > 0) && (
              <Card className="bg-card">
                <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Time Per Question</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timeDistData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="q" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} unit="s" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 12 }}
                          formatter={(v: number) => [`${v}s`, "Time spent"]}
                        />
                        <Bar dataKey="time" radius={[3, 3, 0, 0]}
                          fill="hsl(var(--primary))"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Slowest Questions */}
            {slowest.length > 0 && (
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-warning">
                    <AlertTriangle className="w-5 h-5" /> Slowest Questions — Review These
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {slowest.map(ans => {
                    const q = ans.quiz_questions;
                    const idx = answers.indexOf(ans);
                    return (
                      <div key={ans.question_id} className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
                        <span className="text-xs font-bold text-warning mt-0.5 shrink-0">Q{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{q?.question_text || "Question"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {Math.round((ans.time_spent_ms ?? 0) / 1000)}s · {ans.is_correct ? "Correct" : ans.selected_option ? "Wrong" : "Skipped"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Fastest Correct */}
            {fastest.filter(a => a.is_correct).length > 0 && (
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-success">
                    <Lightbulb className="w-5 h-5" /> Fastest Correct — Your Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {fastest.filter(a => a.is_correct).slice(0, 3).map(ans => {
                    const q = ans.quiz_questions;
                    const idx = answers.indexOf(ans);
                    return (
                      <div key={ans.question_id} className="flex items-start gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
                        <span className="text-xs font-bold text-success mt-0.5 shrink-0">Q{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{q?.question_text || "Question"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{Math.round((ans.time_spent_ms ?? 0) / 1000)}s · Correct</p>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Improvement Tips */}
            <Card className="bg-card border-primary/20">
              <CardHeader><CardTitle className="flex items-center gap-2 text-primary"><Lightbulb className="w-5 h-5" /> Improvement Tips</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {skipped > 0 && <p>• You skipped {skipped} questions — attempt all questions next time, even if unsure.</p>}
                {incorrect > correct && <p>• More wrong than correct answers — focus on understanding concepts before attempting.</p>}
                {avgTimeMs > 120000 && <p>• Average time per question is {Math.round(avgTimeMs / 1000)}s — practice speed with timed sets.</p>}
                {negativeMarks > score * 0.2 && <p>• Negative marks are high ({negativeMarks.toFixed(1)}) — avoid guessing on questions you're unsure about.</p>}
                {passed && correct > incorrect && <p>• Great performance! Review the questions you got wrong to push your score higher.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
