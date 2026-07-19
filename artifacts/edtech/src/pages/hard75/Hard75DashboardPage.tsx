import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import {
  Flame, Trophy, Target, Calendar, CheckCircle2, Circle,
  Droplets, Dumbbell, BookOpen, Salad, Camera, PlayCircle, RotateCcw,
  Quote, TrendingUp, CheckSquare,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const MOTIVATIONAL_QUOTES = [
  "The only bad workout is the one that didn't happen.",
  "Discipline is choosing between what you want now and what you want most.",
  "It never gets easier, you just get stronger.",
  "Push yourself because no one else is going to do it for you.",
  "Success is the sum of small efforts repeated day in and day out.",
];

function getTodayQuote() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
}

export default function Hard75DashboardPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: challengeData, isLoading: challengeLoading } = useQuery({
    queryKey: ["hard75-challenge"],
    queryFn: () => apiFetch("/hard75/challenge") as Promise<{ challenge: any }>,
  });

  const { data: todayData, isLoading: todayLoading } = useQuery({
    queryKey: ["hard75-today"],
    queryFn: () => apiFetch("/hard75/today") as Promise<any>,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["hard75-analytics"],
    queryFn: () => apiFetch("/hard75/analytics") as Promise<any>,
    staleTime: 30_000,
  });

  const startChallenge = useMutation({
    mutationFn: () => apiFetch("/hard75/challenge/start", { method: "POST" }) as Promise<any>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-challenge"] });
      toast({ title: "Challenge started!", description: "Day 1 of 75 begins now. You've got this!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const restartChallenge = useMutation({
    mutationFn: () => apiFetch("/hard75/challenge/restart", { method: "POST" }) as Promise<any>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-challenge"] });
      toast({ title: "Challenge restarted", description: "Starting fresh from Day 1." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const challenge = challengeData?.challenge;
  const today = todayData;
  const isLoading = challengeLoading || todayLoading;

  const currentDay = challenge?.current_day ?? 0;
  const remainingDays = Math.max(0, 75 - currentDay);
  const completionPct = analyticsData?.completionPct ?? 0;
  const currentStreak = analyticsData?.currentStreak ?? 0;

  const tasks = [
    { key: "workout1", label: "Workout 1 (Indoor)", icon: Dumbbell, done: today?.tasks?.workout1?.done, href: "/75hard/workout" },
    { key: "workout2", label: "Workout 2 (Outdoor)", icon: Dumbbell, done: today?.tasks?.workout2?.done, href: "/75hard/workout" },
    { key: "water",    label: "1 Gallon Water",       icon: Droplets,  done: today?.tasks?.water?.done,   href: "/75hard/water" },
    { key: "reading",  label: "10 Pages Reading",     icon: BookOpen,  done: today?.tasks?.reading?.done, href: "/75hard/reading" },
    { key: "diet",     label: "Diet / No Cheat Meal", icon: Salad,     done: today?.tasks?.diet?.done,    href: "/75hard/diet" },
    { key: "photo",    label: "Progress Photo",       icon: Camera,    done: today?.tasks?.photo?.done,   href: "/75hard/photos" },
  ];

  const doneTasks = tasks.filter(t => t.done).length;

  if (isLoading) {
    return (
      <Hard75Layout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Hard75Layout>
    );
  }

  if (!challenge) {
    return (
      <Hard75Layout>
        <div className="flex flex-col items-center justify-center py-12 gap-6 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Trophy className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">75 Hard Challenge</h1>
            <p className="text-muted-foreground max-w-sm mx-auto text-sm leading-relaxed">
              The 75 Hard program is a transformative mental and physical challenge. Complete all 6 tasks every day for 75 days — no exceptions, no substitutions.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-sm text-sm">
            {["2 Workouts (45 min+)", "1 Workout Outdoors", "1 Gallon of Water", "10 Pages of Reading", "Follow a Diet", "Progress Photo"].map(t => (
              <div key={t} className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span>{t}</span>
              </div>
            ))}
          </div>
          <Button
            size="lg"
            className="w-full sm:w-auto min-h-[52px] text-base px-8"
            onClick={() => startChallenge.mutate()}
            disabled={startChallenge.isPending}
          >
            <PlayCircle className="w-5 h-5 mr-2" />
            {startChallenge.isPending ? "Starting…" : "Start the Challenge"}
          </Button>
        </div>
      </Hard75Layout>
    );
  }

  return (
    <Hard75Layout>
      <div className="space-y-5">

        {/* Header stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Calendar,    label: "Current Day",    value: `Day ${currentDay}`,      color: "text-primary" },
            { icon: Target,      label: "Days Remaining", value: `${remainingDays} left`,  color: "text-foreground" },
            { icon: Flame,       label: "Streak",         value: `${currentStreak}d`,      color: "text-orange-500" },
            { icon: TrendingUp,  label: "Completion",     value: `${completionPct}%`,      color: "text-green-500" },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <Icon className={cn("w-5 h-5 mx-auto mb-1.5", color)} />
                <p className={cn("text-xl font-bold", color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Daily progress bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium">{format(new Date(), "EEEE, MMMM d")}</p>
                <p className="text-xs text-muted-foreground">Today's progress</p>
              </div>
              <Badge variant={today?.allDone ? "default" : "secondary"} className="shrink-0">
                {doneTasks}/6 tasks
              </Badge>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${(doneTasks / 6) * 100}%` }}
              />
            </div>
            {today?.allDone && (
              <p className="text-xs text-green-500 font-medium mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Day {currentDay} Complete!
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quote */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex gap-3">
            <Quote className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-foreground italic leading-relaxed">{getTodayQuote()}</p>
          </CardContent>
        </Card>

        {/* Today's tasks */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Today's Tasks</h2>
          <div className="grid gap-2">
            {tasks.map(({ key, label, icon: Icon, done, href }) => (
              <button
                key={key}
                onClick={() => setLocation(href)}
                className="w-full text-left"
              >
                <Card className={cn(
                  "transition-all active:scale-[0.99]",
                  "hover:border-primary/40 cursor-pointer",
                  done && "opacity-70"
                )}>
                  <CardContent className="p-4 flex items-center gap-3 min-h-[56px]">
                    {done
                      ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                      : <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                    }
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className={cn("text-sm flex-1", done && "line-through text-muted-foreground")}>
                      {label}
                    </span>
                    {done && (
                      <Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-500/10 text-xs shrink-0">
                        Done
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => setLocation("/75hard/tasks")}
          >
            <CheckSquare className="w-4 h-4 mr-1.5" /> Log Tasks
          </Button>
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => setLocation("/75hard/journal")}
          >
            <BookOpen className="w-4 h-4 mr-1.5" /> Journal
          </Button>
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => setLocation("/75hard/analytics")}
          >
            <TrendingUp className="w-4 h-4 mr-1.5" /> Analytics
          </Button>
          <Button
            variant="ghost"
            className="min-h-[44px] text-muted-foreground"
            onClick={() => restartChallenge.mutate()}
            disabled={restartChallenge.isPending}
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            {restartChallenge.isPending ? "Restarting…" : "Restart"}
          </Button>
        </div>

      </div>
    </Hard75Layout>
  );
}
