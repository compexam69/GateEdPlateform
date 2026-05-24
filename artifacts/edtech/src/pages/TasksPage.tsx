import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles, Trash2, ChevronDown, Loader2, AlertTriangle, Calendar, GripVertical } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { getTasks, getGetTasksUrl, useUpdateTask, useDeleteTask } from "@workspace/api-client-react";
import type { StudyTask } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function getApiBase() {
  return `${window.location.protocol}//${window.location.hostname}:8080/api`;
}

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "border-border text-muted-foreground bg-muted/30" },
  in_progress: { label: "In Progress", color: "border-primary/40 text-primary bg-primary/10" },
  completed: { label: "Completed", color: "border-success/40 text-success bg-success/10" },
  skipped: { label: "Skipped", color: "border-muted-foreground/30 text-muted-foreground bg-muted/20" },
} as const;

const PRIORITY_LABELS: Record<number, string> = { 0: "Low", 1: "Medium", 2: "High", 3: "Critical" };
function priorityColor(p: number) {
  if (p >= 3) return "bg-destructive/10 text-destructive border-destructive/20";
  if (p >= 2) return "bg-warning/10 text-warning border-warning/20";
  if (p >= 1) return "bg-primary/10 text-primary border-primary/20";
  return "bg-muted text-muted-foreground border-border";
}

function SortableTaskCard({ task, onStatusChange, onDelete, today }: {
  task: StudyTask;
  onStatusChange: (task: StudyTask, status: string) => void;
  onDelete: (id: string) => void;
  today: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const statusCfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const priority = (task as unknown as { priority?: number }).priority ?? 0;
  const dueDate = (task as unknown as { due_date?: string }).due_date;
  const isOverdue = dueDate && dueDate < today && task.status !== "completed" && task.status !== "skipped";

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50 z-50")}>
      <Card className={cn("bg-card transition-opacity", (task.status === "completed" || task.status === "skipped") && "opacity-60")}>
        <CardContent className="p-4 flex items-start gap-2">
          <button
            {...attributes}
            {...listeners}
            className="mt-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-grab active:cursor-grabbing shrink-0 touch-none"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 flex items-center gap-1 transition-colors hover:opacity-80",
                statusCfg.color
              )}>
                {statusCfg.label}<ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <DropdownMenuItem key={key} onClick={() => onStatusChange(task, key)} className={task.status === key ? "font-medium" : ""}>
                  {cfg.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1 min-w-0">
            <p className={cn("font-medium text-sm", (task.status === "completed" || task.status === "skipped") && "line-through text-muted-foreground")}>
              {task.title}
            </p>
            {task.description && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{task.description}</p>}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {task.source === "auto" && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                  <Sparkles className="w-2.5 h-2.5" /> Auto
                </span>
              )}
              {priority > 0 && (
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4", priorityColor(priority))}>
                  {PRIORITY_LABELS[priority] || "Low"}
                </Badge>
              )}
              {dueDate && (
                <span className={cn(
                  "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border",
                  isOverdue ? "text-destructive border-destructive/30 bg-destructive/5" : "text-muted-foreground border-border bg-muted/30"
                )}>
                  <Calendar className="w-2.5 h-2.5" />
                  {isOverdue ? "Overdue · " : ""}{format(new Date(dueDate), "MMM d")}
                </span>
              )}
            </div>
          </div>

          <Button
            size="icon" variant="ghost"
            className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TasksPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<0 | 1 | 2 | 3>(0);
  const [newDueDate, setNewDueDate] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "completed" | "skipped">("all");
  const [generating, setGenerating] = useState(false);
  const [weakTopics, setWeakTopics] = useState<Array<{ topicId: string; title: string; avg_accuracy: number }>>([]);
  const [showWeak, setShowWeak] = useState(false);
  const [localTasks, setLocalTasks] = useState<StudyTask[]>([]);

  const today = new Date().toISOString().split("T")[0];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: [getGetTasksUrl()],
    queryFn: () => getTasks(),
  });

  useEffect(() => {
    if (tasks.length > 0) setLocalTasks(tasks as StudyTask[]);
  }, [tasks]);

  const createTask = useMutation({
    mutationFn: async (data: { title: string; priority: number; due_date?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const body: Record<string, unknown> = { title: data.title, priority: data.priority, target_type: "free_text" };
      if (data.due_date) body.due_date = data.due_date;
      const res = await fetch(`${getApiBase()}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to add task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getGetTasksUrl()] });
      setNewTitle(""); setNewPriority(0); setNewDueDate(""); setShowAdd(false);
      toast({ title: "Task added" });
    },
    onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
  });

  const reorderTasks = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${getApiBase()}/tasks/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error("Reorder failed");
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: [getGetTasksUrl()] });
      toast({ title: "Reorder failed", description: "Could not save new order.", variant: "destructive" });
    },
  });

  const updateTask = useUpdateTask({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: [getGetTasksUrl()] }) },
  });

  const deleteTask = useDeleteTask({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: [getGetTasksUrl()] }); toast({ title: "Task deleted" }); },
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = localTasks.findIndex(t => t.id === active.id);
    const newIdx = localTasks.findIndex(t => t.id === over.id);
    const reordered = arrayMove(localTasks, oldIdx, newIdx);
    setLocalTasks(reordered);
    reorderTasks.mutate(reordered.map(t => t.id));
  }

  function handleAddTask() {
    if (!newTitle.trim()) return;
    createTask.mutate({ title: newTitle.trim(), priority: newPriority, due_date: newDueDate || undefined });
  }

  function handleSetStatus(task: StudyTask, status: string) {
    updateTask.mutate({ taskId: task.id, data: { status: status as import("@workspace/api-client-react").StudyTaskUpdateStatus } });
  }

  async function handleGenerate() {
    setGenerating(true); setShowWeak(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${getApiBase()}/tasks/generate`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: [getGetTasksUrl()] });
      if (data.weak_topics) { setWeakTopics(data.weak_topics); setShowWeak(true); }
      toast({ title: data.created > 0 ? "Smart plan generated!" : "You're on track!", description: data.message });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setGenerating(false); }
  }

  const filterOptions: Array<{ key: typeof filter; label: string }> = [
    { key: "all", label: "All" }, { key: "pending", label: "Pending" },
    { key: "in_progress", label: "In Progress" }, { key: "completed", label: "Completed" }, { key: "skipped", label: "Skipped" },
  ];

  const filtered = localTasks.filter(t => filter === "all" || t.status === filter);
  const counts = {
    pending: localTasks.filter(t => t.status === "pending").length,
    in_progress: localTasks.filter(t => t.status === "in_progress").length,
    completed: localTasks.filter(t => t.status === "completed").length,
    skipped: localTasks.filter(t => t.status === "skipped").length,
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Study Planner</h1>
            <p className="text-muted-foreground mt-1">{counts.pending + counts.in_progress} active · {counts.completed} completed</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4 text-accent" /> Smart Plan</>}
            </Button>
            <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-2" /> Add Task</Button>
          </div>
        </div>

        {showWeak && weakTopics.length > 0 && (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-warning">Weak topics identified</p>
                  <p className="text-xs text-muted-foreground mt-1">Tasks added for: {weakTopics.map(t => `${t.title} (${t.avg_accuracy}%)`).join(", ")}</p>
                </div>
                <button onClick={() => setShowWeak(false)} className="text-muted-foreground hover:text-foreground text-xs shrink-0">Dismiss</button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-1.5 flex-wrap">
          {filterOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                filter === key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
              )}
            >
              {label}{key !== "all" && counts[key as keyof typeof counts] > 0 && ` (${counts[key as keyof typeof counts]})`}
            </button>
          ))}
        </div>

        {filter === "all" && (
          <p className="text-xs text-muted-foreground -mt-3 flex items-center gap-1">
            <GripVertical className="w-3 h-3" /> Drag tasks to reorder
          </p>
        )}

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">{filter === "completed" ? "No completed tasks yet." : "No tasks here. Add one or generate a smart plan!"}</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filtered.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {filtered.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    today={today}
                    onStatusChange={handleSetStatus}
                    onDelete={(id) => deleteTask.mutate({ taskId: id })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Task</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Task</Label>
              <Input
                placeholder="e.g. Revise Chapter 3 of Physics"
                value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddTask(); }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <div className="flex gap-2">
                {([0, 1, 2, 3] as const).map(p => (
                  <button
                    key={p} onClick={() => setNewPriority(p)}
                    className={cn(
                      "flex-1 py-1.5 rounded text-xs font-medium border transition-colors",
                      newPriority === p ? priorityColor(p) + " ring-1 ring-offset-1 ring-primary" : "border-border text-muted-foreground hover:border-primary"
                    )}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Due Date <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} min={today} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowAdd(false); setNewTitle(""); setNewDueDate(""); setNewPriority(0); }}>Cancel</Button>
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
