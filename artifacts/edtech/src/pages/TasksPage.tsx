import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTasks, getGetTasksUrl,
  useCreateTask, useUpdateTask, useDeleteTask,
} from "@workspace/api-client-react";
import type { StudyTask } from "@workspace/api-client-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function TasksPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: [getGetTasksUrl()],
    queryFn: () => getTasks(),
  });

  const createTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [getGetTasksUrl()] });
        setNewTitle("");
        setShowAdd(false);
        toast({ title: "Task added" });
      },
    },
  });

  const updateTask = useUpdateTask({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [getGetTasksUrl()] }),
    },
  });

  const deleteTask = useDeleteTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [getGetTasksUrl()] });
        toast({ title: "Task deleted" });
      },
    },
  });

  function handleAddTask() {
    if (!newTitle.trim()) return;
    createTask.mutate({ data: { title: newTitle.trim(), target_type: "free_text" } });
  }

  function handleToggle(task: StudyTask) {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    updateTask.mutate({ taskId: task.id, data: { status: newStatus } });
  }

  function handleDelete(taskId: string) {
    deleteTask.mutate({ taskId });
  }

  const filtered = tasks.filter((t: StudyTask) => {
    if (filter === "pending") return t.status !== "completed";
    if (filter === "completed") return t.status === "completed";
    return true;
  });

  const pending = tasks.filter((t: StudyTask) => t.status !== "completed").length;
  const completed = tasks.filter((t: StudyTask) => t.status === "completed").length;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Study Planner</h1>
            <p className="text-muted-foreground mt-1">{pending} pending · {completed} completed</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Task
          </Button>
        </div>

        <div className="flex gap-2">
          {(["all", "pending", "completed"] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{filter === "completed" ? "No completed tasks yet." : "No tasks here. Add one above!"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((task: StudyTask) => (
              <Card key={task.id} className={`bg-card transition-opacity ${task.status === "completed" ? "opacity-60" : ""}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Checkbox
                    id={`task-${task.id}`}
                    checked={task.status === "completed"}
                    onCheckedChange={() => handleToggle(task)}
                  />
                  <label
                    htmlFor={`task-${task.id}`}
                    className={`flex-1 font-medium cursor-pointer text-sm ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}
                  >
                    {task.title}
                    {task.description && (
                      <span className="block text-xs text-muted-foreground font-normal mt-0.5">{task.description}</span>
                    )}
                  </label>
                  {task.source === "auto" && (
                    <span className="flex items-center gap-1 text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full shrink-0">
                      <Sparkles className="w-3 h-3" /> Auto
                    </span>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0"
                    onClick={() => handleDelete(task.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              placeholder="e.g. Revise Chapter 3 of Physics"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAddTask(); }}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAddTask} disabled={!newTitle.trim() || createTask.isPending}>
                {createTask.isPending ? "Adding..." : "Add Task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
