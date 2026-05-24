import { AppLayout } from "@/components/layout/AppLayout";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, ArrowLeft, BarChart2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export default function ExamResultPage() {
  const { resultId } = useParams<{ resultId: string }>();

  const data = [
    { name: "Correct", value: 15, color: "hsl(var(--success))" },
    { name: "Incorrect", value: 3, color: "hsl(var(--destructive))" },
    { name: "Skipped", value: 2, color: "hsl(var(--muted-foreground))" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Exam Results</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Performance Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-6">
                <div className="text-center">
                  <div className="text-5xl font-bold text-primary mb-2">75%</div>
                  <div className="text-muted-foreground">Score (60/80)</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border mt-4">
                <div className="text-center">
                  <div className="text-xl font-semibold">15</div>
                  <div className="text-sm text-success flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3"/> Correct</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold">3</div>
                  <div className="text-sm text-destructive flex items-center justify-center gap-1"><XCircle className="w-3 h-3"/> Incorrect</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Accuracy Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Detailed Solutions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 border border-success/30 bg-success/5 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="font-semibold">Q1. Question text here...</span>
                <span className="text-success font-medium flex items-center"><CheckCircle className="w-4 h-4 mr-1"/> Correct</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Explanation: The correct approach is to use formula X because...</p>
            </div>
            
            <div className="p-4 border border-destructive/30 bg-destructive/5 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="font-semibold">Q2. Another question text here...</span>
                <span className="text-destructive font-medium flex items-center"><XCircle className="w-4 h-4 mr-1"/> Incorrect</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Explanation: You selected A, but the correct answer is C. The reason is...</p>
              <Button variant="link" className="text-primary px-0 mt-2 h-auto">Watch Video Solution</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
