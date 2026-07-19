import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { Camera, Plus, Trash2, Loader2, Download, Image } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Hard75PhotosPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [showAdd, setShowAdd] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoNotes, setPhotoNotes] = useState("");
  const [photoDate, setPhotoDate] = useState(today);
  const [dayNum, setDayNum] = useState("1");
  const [view, setView] = useState<"gallery" | "before-after">("gallery");
  const [selected, setSelected] = useState<any | null>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["hard75-photos"],
    queryFn: () => apiFetch("/hard75/photos") as Promise<any[]>,
  });

  const { data: challenge } = useQuery({
    queryKey: ["hard75-challenge"],
    queryFn: () => apiFetch("/hard75/challenge") as Promise<{ challenge: any }>,
    select: (d: any) => d.challenge,
  });

  const add = useMutation({
    mutationFn: (body: object) => apiFetch("/hard75/photos", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-photos"] });
      qc.invalidateQueries({ queryKey: ["hard75-today"] });
      setShowAdd(false);
      setPhotoUrl(""); setPhotoNotes(""); setPhotoDate(today);
      toast({ title: "Photo added!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/hard75/photos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-photos"] });
      setSelected(null);
      toast({ title: "Photo deleted" });
    },
  });

  const first = photos[0];
  const last = photos[photos.length - 1];
  const todayLogged = photos.some((p: any) => p.date === today);

  return (
    <Hard75Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Progress Photos</h1>
            <p className="text-sm text-muted-foreground">{photos.length} photos total</p>
          </div>
          <Button className="min-h-[44px] shrink-0" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Photo
          </Button>
        </div>

        {/* Today's prompt */}
        {!todayLogged && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <Camera className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Take today's progress photo</p>
                <p className="text-xs text-muted-foreground">Paste a public URL after uploading to your service.</p>
              </div>
              <Button size="sm" className="min-h-[40px] shrink-0" onClick={() => setShowAdd(true)}>Add</Button>
            </CardContent>
          </Card>
        )}

        {/* View toggle */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={view === "gallery" ? "default" : "outline"}
            className="min-h-[40px] flex-1 sm:flex-none"
            onClick={() => setView("gallery")}
          >
            <Image className="w-4 h-4 mr-1.5" /> Gallery
          </Button>
          <Button
            size="sm"
            variant={view === "before-after" ? "default" : "outline"}
            className="min-h-[40px] flex-1 sm:flex-none"
            onClick={() => setView("before-after")}
            disabled={photos.length < 2}
          >
            Before / After
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : photos.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Camera className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground text-sm">No photos yet. Add your first progress photo!</p>
            </CardContent>
          </Card>
        ) : view === "before-after" && first && last && first.id !== last.id ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {[
              { label: "Day 1 / Before", photo: first },
              { label: `Day ${challenge?.current_day ?? photos.length} / Now`, photo: last },
            ].map(({ label, photo }) => (
              <Card key={photo.id}>
                <CardContent className="p-3">
                  <Badge variant="outline" className="mb-2 text-xs">{label}</Badge>
                  <div className="aspect-square bg-muted rounded-xl overflow-hidden">
                    <img src={photo.photo_url} alt={label} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {format(new Date(photo.date + "T00:00:00"), "MMM d, yyyy")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((photo: any) => (
              <Card
                key={photo.id}
                className="cursor-pointer hover:border-primary/50 active:scale-[0.98] transition-all"
                onClick={() => setSelected(photo)}
              >
                <CardContent className="p-2">
                  <div className="aspect-square bg-muted rounded-xl overflow-hidden mb-2">
                    <img
                      src={photo.photo_url}
                      alt={`Day ${photo.day_number}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex items-center justify-between px-0.5">
                    {photo.day_number && (
                      <Badge variant="outline" className="text-xs">Day {photo.day_number}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(new Date(photo.date + "T00:00:00"), "MMM d")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add photo sheet */}
      <ResponsiveDialog open={showAdd} onOpenChange={setShowAdd} title="Add Progress Photo">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload your photo to Imgur, Google Drive, or any host, then paste the public URL here.
          </p>
          <div>
            <Label>Photo URL</Label>
            <Input
              value={photoUrl}
              onChange={e => setPhotoUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1.5 h-11"
              inputMode="url"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={photoDate} onChange={e => setPhotoDate(e.target.value)} className="mt-1.5 h-11" />
            </div>
            <div>
              <Label>Day # (optional)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={dayNum}
                onChange={e => setDayNum(e.target.value)}
                min="1" max="75"
                className="mt-1.5 h-11"
              />
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input
              value={photoNotes}
              onChange={e => setPhotoNotes(e.target.value)}
              placeholder="e.g. Front view, morning"
              className="mt-1.5 h-11"
            />
          </div>
          {photoUrl && (
            <div className="aspect-video bg-muted rounded-xl overflow-hidden">
              <img
                src={photoUrl}
                alt="Preview"
                className="w-full h-full object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="min-h-[44px]" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              className="min-h-[44px]"
              onClick={() => add.mutate({ photo_url: photoUrl, notes: photoNotes, date: photoDate, day_number: Number(dayNum) || 1 })}
              disabled={add.isPending || !photoUrl}
            >
              {add.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Add Photo
            </Button>
          </div>
        </div>
      </ResponsiveDialog>

      {/* View photo sheet */}
      <ResponsiveDialog
        open={!!selected}
        onOpenChange={v => { if (!v) setSelected(null); }}
        title={selected?.day_number ? `Day ${selected.day_number}` : "Progress Photo"}
      >
        {selected && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground -mt-2">
              {format(new Date(selected.date + "T00:00:00"), "MMMM d, yyyy")}
            </p>
            <div className="bg-muted rounded-xl overflow-hidden">
              <img src={selected.photo_url} alt="Progress" className="w-full object-contain max-h-80 sm:max-h-96" />
            </div>
            {selected.notes && <p className="text-sm text-muted-foreground">{selected.notes}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="min-h-[44px]" asChild>
                <a href={selected.photo_url} target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4 mr-1.5" /> Open
                </a>
              </Button>
              <Button
                variant="destructive"
                className="min-h-[44px]"
                onClick={() => remove.mutate(selected.id)}
                disabled={remove.isPending}
              >
                {remove.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  : <Trash2 className="w-4 h-4 mr-1.5" />
                }
                Delete
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </Hard75Layout>
  );
}
