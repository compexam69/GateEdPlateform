import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical, Sparkles } from "lucide-react";

export default function TasksPage() {
  const tasks = [
    { id: 1, title: "Complete Physics Chapter 3 DPP", status: "pending", isAuto: true },
    { id: 2, title: "Review Chemistry formulas", status: "pending", isAuto: false },
    { id: 3, title: "Watch Math Topic 2 Lecture", status: "completed", isAuto: true },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Study Planner</h1>
            <p className="text-muted-foreground mt-1">Your daily tasks and goals.</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" /> Add Task
          </Button>
        </div>

        <div className="space-y-3">
          {tasks.map(task => (
            <Card key={task.id} className={`bg-card ${task.status === 'completed' ? 'opacity-50' : ''}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab" />
                <Checkbox id={`task-${task.id}`} checked={task.status === 'completed'} />
                <label 
                  htmlFor={`task-${task.id}`}
                  className={`flex-1 font-medium cursor-pointer ${task.status === 'completed' ? 'line-through' : ''}`}
                >
                  {task.title}
                </label>
                {task.isAuto && (
                  <span className="flex items-center text-xs font-medium text-accent bg-accent/10 px-2 py-1 rounded-full">
                    <Sparkles className="w-3 h-3 mr-1" /> Auto
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
