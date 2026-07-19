import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { BookMarked, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, subDays } from "date-fns";
import { cn } from "@/lib/utils";

const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
const MOOD_LABELS = ["Terrible", "Bad", "Okay", "Good", "Great"];

// ─── RatingPicker: compact on mobile, comfortable on sm+ ─────────────────────
function RatingPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <Label className="text-xs sm:text-sm">
        {label}{" "}
        <span className="text-muted-foreground font-normal">({MOOD_LABELS[value - 1]})</span>
      </Label>
      {/* Mobile: tighter gap + smaller touch targets; sm+: original sizing */}
      <div className="flex gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
        {[1, 2, 3, 4, 5].map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={cn(
              "flex-1 min-h-[40px] sm:min-h-[48px] rounded-lg sm:rounded-xl text-xl sm:text-2xl transition-all border",
              value === v
                ? "border-primary bg-primary/10 scale-105"
                : "border-border hover:border-primary/50 opacity-50 hover:opacity-80"
            )}
            aria-label={MOOD_LABELS[v - 1]}
          >
            {MOODS[v - 1]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Hard75JournalPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [rating, setRating] = useState(3);
  const [win, setWin] = useState("");
  const [challenge, setChallenge] = useState("");
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { data: entry, isLoading } = useQuery<any>({
    queryKey: ["hard75-journal", selectedDate],
    queryFn: async () => {
      const data = await apiFetch(`/hard75/journal?date=${selectedDate}`) as any;
      if (data) {
        setMood(data.mood ?? 3);
        setEnergy(data.energy ?? 3);
        setRating(data.rating ?? 3);
        setWin(data.biggest_win ?? "");
        setChallenge(data.biggest_challenge ?? "");
        setNotes(data.notes ?? "");
      } else {
        setMood(3); setEnergy(3); setRating(3); setWin(""); setChallenge(""); setNotes("");
      }
      setLoaded(true);
      return data;
    },
  });

  const { data: journals = [] } = useQuery({
    queryKey: ["hard75-journals"],
    queryFn: () => apiFetch("/hard75/journals") as Promise<any[]>,
  });

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/hard75/journal", {
        method: "POST",
        body: JSON.stringify({ date: selectedDate, mood, energy, rating, biggest_win: win, biggest_challenge: challenge, notes }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-journal", selectedDate] });
      qc.invalidateQueries({ queryKey: ["hard75-journals"] });
      toast({ title: "Journal saved!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Hard75Layout>
      {/* Mobile: tighter vertical stacking; sm+: original spacing */}
      <div className="space-y-3 sm:space-y-5">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg sm:text-xl font-bold leading-tight">Daily Journal</h1>
          <div className="text-xs sm:text-sm text-muted-foreground">{journals.length} entries</div>
        </div>

        {/* ── Date navigation ──────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 sm:h-11 sm:w-11 shrink-0"
            onClick={() => { setLoaded(false); setSelectedDate(subDays(new Date(selectedDate), 1).toISOString().slice(0, 10)); }}
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={e => { setLoaded(false); setSelectedDate(e.target.value); }}
            max={today}
            className="h-9 sm:h-11 text-xs sm:text-sm text-center flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 sm:h-11 sm:w-11 shrink-0"
            disabled={selectedDate >= today}
            onClick={() => { setLoaded(false); setSelectedDate(addDays(new Date(selectedDate), 1).toISOString().slice(0, 10)); }}
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </div>

        {/* ── Entry form card ──────────────────────────────────────────── */}
        <Card>
          {/* Mobile: tighter header padding; sm+: original */}
          <CardHeader className="pb-2 pt-3 px-3 sm:pb-3 sm:pt-4 sm:px-6">
            <CardTitle className="text-sm sm:text-base flex items-center gap-1.5 sm:gap-2">
              <BookMarked className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary shrink-0" />
              {format(new Date(selectedDate + "T00:00:00"), "EEEE, MMMM d")}
              {entry && (
                <span className="text-[10px] sm:text-xs text-muted-foreground font-normal">(saved)</span>
              )}
            </CardTitle>
          </CardHeader>

          {/* Mobile: tighter vertical rhythm; sm+: original */}
          <CardContent className="space-y-3 sm:space-y-5 px-3 pb-3 sm:px-6 sm:pb-6">
            {isLoading ? (
              <div className="flex justify-center py-6 sm:py-8">
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <RatingPicker value={mood} onChange={setMood} label="Mood" />
                <RatingPicker value={energy} onChange={setEnergy} label="Energy Level" />

                <div>
                  <Label className="text-xs sm:text-sm">Biggest Win Today</Label>
                  <Input
                    value={win}
                    onChange={e => setWin(e.target.value)}
                    placeholder="What went well?"
                    className="mt-1 sm:mt-1.5 h-9 sm:h-11 text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs sm:text-sm">Biggest Challenge</Label>
                  <Input
                    value={challenge}
                    onChange={e => setChallenge(e.target.value)}
                    placeholder="What was hard today?"
                    className="mt-1 sm:mt-1.5 h-9 sm:h-11 text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs sm:text-sm">Notes / Reflection</Label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="How are you feeling overall? What did you learn today?"
                    className="mt-1 sm:mt-1.5 h-24 sm:h-32 resize-none text-xs sm:text-sm"
                  />
                </div>
                <RatingPicker value={rating} onChange={setRating} label="Overall Day Rating" />

                {/* Save button: compact on mobile, full-height on sm+ */}
                <Button
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="w-full h-10 sm:min-h-[52px] text-sm sm:text-base"
                >
                  {save.isPending ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin mr-1.5 sm:mr-2" /> : null}
                  {entry ? "Update Entry" : "Save Entry"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Past entries ─────────────────────────────────────────────── */}
        {journals.length > 0 && (
          <Card>
            <CardHeader className="pb-1.5 pt-3 px-3 sm:pb-2 sm:pt-4 sm:px-6">
              <CardTitle className="text-sm sm:text-base">Past Entries</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-4">
              <div className="space-y-0.5 sm:space-y-1">
                {journals.slice(0, 10).map((j: any) => (
                  <button
                    key={j.date}
                    onClick={() => { setLoaded(false); setSelectedDate(j.date); }}
                    className="w-full flex items-center gap-2 sm:gap-3 py-2 px-2 sm:py-3 sm:px-3 rounded-lg sm:rounded-xl hover:bg-muted/60 active:bg-muted transition-colors text-left min-h-[44px] sm:min-h-[56px]"
                  >
                    {/* Mood emoji: smaller on mobile */}
                    <div className="text-lg sm:text-2xl w-7 sm:w-8 shrink-0 text-center">
                      {MOODS[(j.mood ?? 3) - 1]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium leading-snug">
                        {format(new Date(j.date + "T00:00:00"), "EEE, MMM d")}
                      </p>
                      {j.biggest_win && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground truncate mt-0.5">
                          {j.biggest_win}
                        </p>
                      )}
                    </div>
                    {/* Rating dots: unchanged — already minimal */}
                    <div className="flex gap-1 shrink-0">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div
                          key={i}
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            i <= (j.rating ?? 3) ? "bg-primary" : "bg-muted"
                          )}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Hard75Layout>
  );
}
