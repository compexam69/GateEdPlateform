import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function TrackerPage() {
  const data = [
    { name: "Jan", internal: 65, external: 60 },
    { name: "Feb", internal: 70, external: 68 },
    { name: "Mar", internal: 75, external: 72 },
    { name: "Apr", internal: 82, external: 78 },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Test Tracker</h1>
            <p className="text-muted-foreground mt-1">Log external mock tests and track progress.</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" /> Log Test
          </Button>
        </div>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Performance Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Line type="monotone" dataKey="internal" stroke="hsl(var(--primary))" strokeWidth={2} name="Internal Tests" />
                  <Line type="monotone" dataKey="external" stroke="hsl(var(--secondary))" strokeWidth={2} name="External Tests" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Date</th>
                    <th className="px-4 py-3">Exam Name</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3 rounded-tr-lg">Percentile</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="px-4 py-3">Apr 15, 2024</td>
                    <td className="px-4 py-3 font-medium">Allen AITS #3</td>
                    <td className="px-4 py-3">180/300</td>
                    <td className="px-4 py-3 text-success">94.5ile</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Mar 22, 2024</td>
                    <td className="px-4 py-3 font-medium">Fiitjee Mock 5</td>
                    <td className="px-4 py-3">165/300</td>
                    <td className="px-4 py-3 text-success">92.1ile</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
