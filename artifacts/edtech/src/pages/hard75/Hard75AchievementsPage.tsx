import { useQuery } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { Trophy, Star, Loader2, Lock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const ACHIEVEMENT_ICONS: Record<string, string> = {
  day_1:        "🌅",
  day_7:        "🔥",
  day_14:       "💪",
  day_21:       "⚡",
  day_30:       "🏆",
  day_45:       "🎯",
  day_60:       "🦁",
  day_75:       "👑",
  perfect_week: "⭐",
  streak_10:    "🌟",
  streak_30:    "💫",
};

export default function Hard75AchievementsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["hard75-achievements"],
    queryFn: () => apiFetch("/hard75/achievements") as Promise<{ achievements: any[]; totalXp: number; level: number }>,
  });

  if (isLoading) {
    return <Hard75Layout><div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></Hard75Layout>;
  }

  const achievements = data?.achievements ?? [];
  const totalXp = data?.totalXp ?? 0;
  const level = data?.level ?? 1;
  const earned = achievements.filter((a: any) => a.earned);
  const xpToNext = 500 - (totalXp % 500);
  const xpPct = Math.round(((totalXp % 500) / 500) * 100);

  return (
    <Hard75Layout>
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Achievements</h1>

        {/* XP / Level card */}
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-xl sm:text-2xl font-black text-primary">L{level}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                  <span className="text-sm font-medium">Level {level}</span>
                  <span className="text-xs text-muted-foreground">{totalXp} XP total</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700"
                    style={{ width: `${xpPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{xpToNext} XP to Level {level + 1}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Earned",   value: earned.length },
            { label: "Total",    value: achievements.length },
            { label: "Total XP", value: totalXp },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <p className="text-xl font-bold text-primary">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Achievements grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {achievements.map((a: any) => (
            <Card key={a.key} className={cn(
              "transition-all",
              a.earned ? "border-primary/30 bg-primary/5" : "opacity-60"
            )}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0",
                  a.earned ? "bg-primary/20" : "bg-muted"
                )}>
                  {a.earned ? (ACHIEVEMENT_ICONS[a.key] ?? "🏅") : <Lock className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{a.label}</p>
                    <Badge variant="outline" className="text-xs gap-1">
                      <Star className="w-2.5 h-2.5" /> {a.xp} XP
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                  {a.earned && a.earned_at && (
                    <p className="text-xs text-primary mt-1 font-medium">
                      Earned {format(new Date(a.earned_at), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
                {a.earned && (
                  <Trophy className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Hard75Layout>
  );
}
