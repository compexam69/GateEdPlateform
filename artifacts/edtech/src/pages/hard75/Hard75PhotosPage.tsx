import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { Camera, Plus, Trash2, Loader2, Download, Image } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
      setPhotoUrl("");
      setPhotoNotes("");
      setPhotoDate(today);
      toast({ title: "Photo added!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/hard75/photos/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hard75-photos"] }); setSelected(null); toast({ title: "Photo deleted" }); },
  });

  const first = photos[0];
  const last = photos[photos.length - 1];
  const todayLogged = photos.some((p: any) => p.date === today);

  return (
    <Hard75Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Progress Photos</h1>
            <p className="text-sm text-muted-foreground">{photos.length} photos total</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Photo
          </Button>
        </div>

        {!todayLogged && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <Camera className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">Take today's progress photo</p>
                <p className="text-xs text-muted-foreground">Add your URL below after uploading to your preferred service.</p>
              </div>
              <Button size="sm" className="ml-auto shrink-0" onClick={() => setShowAdd(true)}>Add</Button>
            </CardContent>
          </Card>
        )}

        {/* View toggle */}
        <div className="flex gap-2">
          <Button size="sm" variant={view === "gallery" ? "default" : "outline"} onClick={() => setView("gallery")}>
            <Image className="w-3.5 h-3.5 mr-1.5" /> Gallery
          </Button>
          <Button size="sm" variant={view === "before-after" ? "default" : "outline"} onClick={() => setView("before-after")} disabled={photos.length < 2}>
            Before / After
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : photos.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Camera className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">No photos yet. Add your first progress photo!</p>
            </CardContent>
          </Card>
        ) : view === "before-after" && first && last && first.id !== last.id ? (
          <div className="grid grid-cols-2 gap-4">
            {[{ label: "Day 1 / Before", photo: first }, { label: `Day ${challenge?.current_day ?? photos.length} / Now`, photo: last }].map(({ label, photo }) => (
              <Card key={photo.id}>
                <CardContent className="p-3">
                  <Badge variant="outline" className="mb-2 text-xs">{label}</Badge>
                  <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                    <img src={photo.photo_url} alt={label} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{format(new Date(photo.date + "T00:00:00"), "MMM d, yyyy")}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((photo: any) => (
              <Card key={photo.id} className="cursor-pointer hover:border-primary/50 transition-all" onClick={() => setSelected(photo)}>
                <CardContent className="p-2">
                  <div className="aspect-square bg-muted rounded overflow-hidden mb-2">
                    <img src={photo.photo_url} alt={`Day ${photo.day_number}`} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center justify-between">
                    {photo.day_number && <Badge variant="outline" className="text-xs">Day {photo.day_number}</Badge>}
                    <span className="text-xs text-muted-foreground">{format(new Date(photo.date + "T00:00:00"), "MMM d")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Progress Photo</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Upload your photo to Supabase Storage, Google Drive, Imgur, or any host, then paste the public URL here.</p>
            <div>
              <Label>Photo URL</Label>
              <Input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://..." className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={photoDate} onChange={e => setPhotoDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Day # (optional)</Label>
                <Input type="number" value={dayNum} onChange={e => setDayNum(e.target.value)} min="1" max="75" className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={photoNotes} onChange={e => setPhotoNotes(e.target.value)} placeholder="e.g. Front view, morning" className="mt-1" />
            </div>
            {photoUrl && (
              <div className="aspect-video bg-muted rounded overflow-hidden">
                <img src={photoUrl} alt="Preview" className="w-full h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={() => add.mutate({ photo_url: photoUrl, notes: photoNotes, date: photoDate, day_number: Number(dayNum) || 1 })} disabled={add.isPending || !photoUrl}>
                {add.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Add Photo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>
            {selected?.day_number ? `Day ${selected.day_number}` : "Progress Photo"} — {selected ? format(new Date(selected.date + "T00:00:00"), "MMMM d, yyyy") : ""}
          </DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg overflow-hidden">
                <img src={selected.photo_url} alt="Progress" className="w-full object-contain max-h-96" />
              </div>
              {selected.notes && <p className="text-sm text-muted-foreground">{selected.notes}</p>}
              <div className="flex gap-2 justify-between">
                <Button variant="outline" size="sm" asChild>
                  <a href={selected.photo_url} target="_blank" rel="noopener noreferrer">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Open
                  </a>
                </Button>
                <Button variant="destructive" size="sm" onClick={() => remove.mutate(selected.id)} disabled={remove.isPending}>
                  {remove.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />} Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Hard75Layout>
  );
}
