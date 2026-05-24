import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash } from "lucide-react";

export default function AdminSubjectsPage() {
  return (
    <AppLayout requireAdmin>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Content Editor</h1>
          <Button><Plus className="w-4 h-4 mr-2" /> Add Subject</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Subjects Tree</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {['Physics', 'Chemistry', 'Mathematics'].map((subject) => (
                <div key={subject} className="p-4 border border-border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-lg">{subject}</div>
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost"><Edit className="w-4 h-4"/></Button>
                      <Button size="icon" variant="ghost" className="text-destructive"><Trash className="w-4 h-4"/></Button>
                    </div>
                  </div>
                  <div className="ml-6 mt-4 pl-4 border-l-2 border-muted space-y-2">
                    <div className="text-sm text-muted-foreground flex items-center justify-between">
                      <span>Chapter 1: Basics</span>
                      <Button size="sm" variant="link">Manage Topics</Button>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="mt-4 ml-6"><Plus className="w-3 h-3 mr-1"/> Add Chapter</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
