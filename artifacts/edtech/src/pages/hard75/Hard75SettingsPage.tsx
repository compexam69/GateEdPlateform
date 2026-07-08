import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { Settings, RotateCcw, AlertTriangle, Loader2, Globe } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function Hard75SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const [showReset, setShowReset] = useState(false);
  const [showRestart, setShowRestart] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["hard75-settings"],
    queryFn: () => apiFetch("/hard75/settings") as Promise<any>,
  });

  const { data: moduleSettings } = useQuery({
    queryKey: ["hard75-module-settings"],
    queryFn: () => apiFetch("/hard75/admin/module-settings") as Promise<any>,
    enabled: isSuperAdmin,
  });

  const [waterGoal, setWaterGoal] = useState("3785");
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [workoutTime, setWorkoutTime] = useState("");
  const [readingTime, setReadingTime] = useState("");
  const [dietTime, setDietTime] = useState("");
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [defaultWater, setDefaultWater] = useState("3785");

  useEffect(() => {
    if (settings) {
      setWaterGoal(String(settings.water_goal_ml ?? 3785));
      setUnits(settings.units ?? "metric");
      setWorkoutTime(settings.workout_reminder_time ?? "");
      setReadingTime(settings.reading_reminder_time ?? "");
      setDietTime(settings.diet_reminder_time ?? "");
    }
  }, [settings]);

  useEffect(() => {
    if (moduleSettings) {
      setGlobalEnabled(moduleSettings.enabled_globally ?? true);
      setDefaultWater(String(moduleSettings.default_water_goal_ml ?? 3785));
    }
  }, [moduleSettings]);

  const saveSettings = useMutation({
    mutationFn: () => apiFetch("/hard75/settings", {
      method: "PUT",
      body: JSON.stringify({
        water_goal_ml: Number(waterGoal) || 3785,
        units,
        workout_reminder_time: workoutTime || null,
        reading_reminder_time: readingTime || null,
        diet_reminder_time: dietTime || null,
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hard75-settings"] }); toast({ title: "Settings saved!" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveModuleSettings = useMutation({
    mutationFn: () => apiFetch("/hard75/admin/module-settings", {
      method: "PUT",
      body: JSON.stringify({ enabled_globally: globalEnabled, default_water_goal_ml: Number(defaultWater) || 3785 }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hard75-module-settings"] }); toast({ title: "Global settings saved!" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const restart = useMutation({
    mutationFn: () => apiFetch("/hard75/challenge/restart", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-challenge"] });
      qc.invalidateQueries({ queryKey: ["hard75-today"] });
      setShowRestart(false);
      toast({ title: "Challenge restarted", description: "Starting fresh from Day 1." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Hard75Layout>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Settings</h1>

        {/* Personal Settings */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Settings className="w-4 h-4 text-primary" /> Personal Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Daily Water Goal (ml)</Label>
              <Input type="number" value={waterGoal} onChange={e => setWaterGoal(e.target.value)} className="mt-1 max-w-xs" min="1000" max="10000" />
              <p className="text-xs text-muted-foreground mt-1">1 gallon ≈ 3,785ml. Default: 3,785ml.</p>
            </div>
            <div>
              <Label>Units</Label>
              <div className="flex gap-2 mt-1">
                {(["metric", "imperial"] as const).map(u => (
                  <Button key={u} size="sm" variant={units === u ? "default" : "outline"}
                    onClick={() => setUnits(u)} className="capitalize">{u}</Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Reminder Times (optional)</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {[
                  { label: "Workout", value: workoutTime, set: setWorkoutTime },
                  { label: "Reading", value: readingTime, set: setReadingTime },
                  { label: "Diet",    value: dietTime,    set: setDietTime },
                ].map(({ label, value, set }) => (
                  <div key={label}>
                    <Label className="text-xs">{label}</Label>
                    <Input type="time" value={value} onChange={e => set(e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                ))}
              </div>
            </div>
            <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
              {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save Settings
            </Button>
          </CardContent>
        </Card>

        {/* Challenge Management */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base text-orange-500 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Challenge Management</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setShowRestart(true)}>
              <RotateCcw className="w-4 h-4 text-orange-500" /> Restart Challenge (Day 1)
            </Button>
          </CardContent>
        </Card>

        {/* Super Admin: Global Settings */}
        {isSuperAdmin && (
          <Card className="border-primary/30">
            <CardHeader className="pb-2"><CardTitle className="text-base text-primary flex items-center gap-2"><Globe className="w-4 h-4" /> Global Module Settings (Super Admin)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Module Status</Label>
                <div className="flex gap-2 mt-1">
                  <Button size="sm" variant={globalEnabled ? "default" : "outline"} onClick={() => setGlobalEnabled(true)}>Enabled</Button>
                  <Button size="sm" variant={!globalEnabled ? "destructive" : "outline"} onClick={() => setGlobalEnabled(false)}>Disabled</Button>
                </div>
              </div>
              <div>
                <Label>Default Water Goal (ml)</Label>
                <Input type="number" value={defaultWater} onChange={e => setDefaultWater(e.target.value)} className="mt-1 max-w-xs" />
              </div>
              <Button onClick={() => saveModuleSettings.mutate()} disabled={saveModuleSettings.isPending}>
                {saveModuleSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save Global Settings
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Restart dialog */}
      <Dialog open={showRestart} onOpenChange={setShowRestart}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="w-5 h-5 text-orange-500" /> Restart Challenge?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will mark your current challenge as restarted and start a new one from Day 1. Your logged data will be preserved.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRestart(false)}>Cancel</Button>
            <Button variant="default" onClick={() => restart.mutate()} disabled={restart.isPending}>
              {restart.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Restart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Hard75Layout>
  );
}
