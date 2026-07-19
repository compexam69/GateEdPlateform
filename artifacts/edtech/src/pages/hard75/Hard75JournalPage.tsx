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

function RatingPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <Label className="text-sm">
        {label}{" "}
        <span className="text-muted-foreground font-normal">({MOOD_LABELS[value - 1]})</span>
      </Label>
      <div className="flex gap-2 mt-2">
        {[1, 2, 3, 4, 5].map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={cn(
              "flex-1 min-h-[48px] rounded-xl text-2xl transition-all border",
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
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Daily Journal</h1>
          <div className="text-sm text-muted-foreground">{journals.length} entries</div>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => { setLoaded(false); setSelectedDate(subDays(new Date(selectedDate), 1).toISOString().slice(0, 10)); }}
            aria-label="Previous day"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={e => { setLoaded(false); setSelectedDate(e.target.value); }}
            max={today}
            className="h-11 text-sm text-center flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={selectedDate >= today}
            onClick={() => { setLoaded(false); setSelectedDate(addDays(new Date(selectedDate), 1).toISOString().slice(0, 10)); }}
            aria-label="Next day"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Entry form */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-primary" />
              {format(new Date(selectedDate + "T00:00:00"), "EEEE, MMMM d")}
              {entry && (
                <span className="text-xs text-muted-foreground font-normal">(saved)</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <RatingPicker value={mood} onChange={setMood} label="Mood" />
                <RatingPicker value={energy} onChange={setEnergy} label="Energy Level" />

                <div>
                  <Label>Biggest Win Today</Label>
                  <Input
                    value={win}
                    onChange={e => setWin(e.target.value)}
                    placeholder="What went well?"
                    className="mt-1.5 h-11"
                  />
                </div>
                <div>
                  <Label>Biggest Challenge</Label>
                  <Input
                    value={challenge}
                    onChange={e => setChallenge(e.target.value)}
                    placeholder="What was hard today?"
                    className="mt-1.5 h-11"
                  />
                </div>
                <div>
                  <Label>Notes / Reflection</Label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="How are you feeling overall? What did you learn today?"
                    className="mt-1.5 h-32 resize-none"
                  />
                </div>
                <RatingPicker value={rating} onChange={setRating} label="Overall Day Rating" />

                <Button
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="w-full min-h-[52px] text-base"
                >
                  {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {entry ? "Update Entry" : "Save Entry"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Past entries */}
        {journals.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base">Past Entries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {journals.slice(0, 10).map((j: any) => (
                  <button
                    key={j.date}
                    onClick={() => { setLoaded(false); setSelectedDate(j.date); }}
                    className="w-full flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-muted/60 active:bg-muted transition-colors text-left min-h-[56px]"
                  >
                    <div className="text-2xl w-8 shrink-0 text-center">{MOODS[(j.mood ?? 3) - 1]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {format(new Date(j.date + "T00:00:00"), "EEE, MMM d")}
                      </p>
                      {j.biggest_win && (
                        <p className="text-xs text-muted-foreground truncate">{j.biggest_win}</p>
                      )}
                    </div>
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
