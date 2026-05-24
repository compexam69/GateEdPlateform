import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, User, Camera, Eye, EyeOff, CheckCircle, Shield, X } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function getApiBase() {
  return `${window.location.protocol}//${window.location.hostname}:8080/api`;
}

async function compressImage(file: File, maxSizeKB = 500, maxDim = 500): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      let quality = 0.9;
      const tryCompress = () => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error("Compression failed")); return; }
          if (blob.size <= maxSizeKB * 1024 || quality <= 0.3) {
            resolve(blob);
          } else {
            quality -= 0.1;
            tryCompress();
          }
        }, "image/jpeg", quality);
      };
      tryCompress();
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.user_metadata?.full_name || "");
  const [savingName, setSavingName] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  const [photoUrl, setPhotoUrl] = useState<string | null>(user?.user_metadata?.photo_url || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const role = user?.user_metadata?.role || "student";
  const isAdmin = role === "admin" || role === "super_admin";

  async function handleSaveName() {
    if (!newName.trim() || newName.trim().length < 2) {
      toast({ title: "Invalid name", description: "Name must be at least 2 characters.", variant: "destructive" });
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: newName.trim() } });
      if (error) throw error;
      await supabase.from("profiles").update({ full_name: newName.trim() }).eq("id", user!.id);
      toast({ title: "Name updated!" });
      setEditingName(false);
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a JPG, PNG, or WEBP image.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be under 2MB.", variant: "destructive" });
      return;
    }
    setUploadingPhoto(true);
    try {
      // Compress client-side
      const compressed = await compressImage(file, 500, 500);

      // Get presigned upload URL from our API
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const urlRes = await fetch(`${getApiBase()}/b2/profile-upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { upload_url, storage_path } = await urlRes.json();

      // Upload to B2
      const uploadRes = await fetch(upload_url, {
        method: "POST",
        headers: {
          Authorization: upload_url, // B2 upload uses the upload auth token separately
          "Content-Type": "image/jpeg",
          "X-Bz-File-Name": encodeURIComponent(storage_path),
          "X-Bz-Content-Sha1": "do_not_verify",
        },
        body: compressed,
      });
      if (!uploadRes.ok) throw new Error("Upload to storage failed");
      const uploadData = await uploadRes.json();

      // Store in profiles
      const photoStorageUrl = storage_path;
      await supabase.from("profiles").update({ photo_url: photoStorageUrl }).eq("id", user!.id);
      await supabase.auth.updateUser({ data: { photo_url: photoStorageUrl } });

      // Show local preview
      const localUrl = URL.createObjectURL(compressed);
      setPhotoUrl(localUrl);
      toast({ title: "Photo updated!" });
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemovePhoto() {
    setPhotoUrl(null);
    await supabase.from("profiles").update({ photo_url: null }).eq("id", user!.id);
    await supabase.auth.updateUser({ data: { photo_url: null } });
    toast({ title: "Photo removed" });
  }

  async function handleChangePassword() {
    if (!currentPwd) { toast({ title: "Enter current password", variant: "destructive" }); return; }
    if (newPwd.length < 8) { toast({ title: "Password too short", description: "At least 8 characters required.", variant: "destructive" }); return; }
    if (!/[A-Z]/.test(newPwd) || !/[a-z]/.test(newPwd) || !/[0-9]/.test(newPwd) || !/[^A-Za-z0-9]/.test(newPwd)) {
      toast({ title: "Weak password", description: "Must contain uppercase, lowercase, number, and special character.", variant: "destructive" }); return;
    }
    if (newPwd !== confirmPwd) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (newPwd === currentPwd) { toast({ title: "Same password", description: "New password must be different.", variant: "destructive" }); return; }

    setChangingPwd(true);
    try {
      const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: user!.email!, password: currentPwd });
      if (reAuthErr) { toast({ title: "Wrong current password", variant: "destructive" }); setChangingPwd(false); return; }
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast({ title: "Password changed successfully!" });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setChangingPwd(false);
    }
  }

  const maskedMobile = (() => {
    const m = user?.user_metadata?.mobile_number || "";
    if (m.length >= 10) return m.slice(0, 3) + " XXXXX " + m.slice(-4);
    return m;
  })();

  const roleLabel = role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Student";
  const isEmailVerified = !!(user?.email_confirmed_at);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>

        {/* Profile Card */}
        <Card className="bg-card">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center shrink-0 ring-2 ring-border overflow-hidden">
                  {photoUrl
                    ? <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" />
                    : <User className="w-12 h-12 text-muted-foreground" />}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-60"
                  title="Change photo"
                >
                  <Camera className="w-4 h-4 text-white" />
                </button>
                {photoUrl && (
                  <button
                    onClick={handleRemovePhoto}
                    className="absolute top-0 right-0 w-6 h-6 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/90 transition-colors"
                    title="Remove photo"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                {uploadingPhoto && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left space-y-2">
                {editingName ? (
                  <div className="flex gap-2 items-center">
                    <Input value={newName} onChange={e => setNewName(e.target.value)} className="max-w-xs" autoFocus />
                    <Button size="sm" onClick={handleSaveName} disabled={savingName}>{savingName ? "Saving..." : "Save"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <h2 className="text-2xl font-bold">{user?.user_metadata?.full_name || "Student"}</h2>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setNewName(user?.user_metadata?.full_name || ""); setEditingName(true); }}>Edit</Button>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <p className="text-muted-foreground">{user?.email}</p>
                    {isEmailVerified
                      ? <Badge variant="secondary" className="bg-success/10 text-success text-xs gap-1"><CheckCircle className="w-3 h-3" />Verified</Badge>
                      : <Badge variant="destructive" className="text-xs">Unverified</Badge>}
                  </div>
                  {maskedMobile && <p className="text-muted-foreground text-sm">{maskedMobile}</p>}
                </div>

                <div className="flex items-center gap-2 justify-center sm:justify-start pt-1">
                  {isAdmin && <Shield className="w-3.5 h-3.5 text-primary" />}
                  <Badge variant="outline" className={isAdmin ? "border-primary text-primary" : ""}>{roleLabel}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Current Password", value: currentPwd, set: setCurrentPwd, show: showCurrent, toggle: () => setShowCurrent(v => !v), placeholder: "Your current password", auto: "current-password" },
              { label: "New Password", value: newPwd, set: setNewPwd, show: showNew, toggle: () => setShowNew(v => !v), placeholder: "Min 8 chars, mixed case, number, special", auto: "new-password" },
              { label: "Confirm New Password", value: confirmPwd, set: setConfirmPwd, show: showConfirm, toggle: () => setShowConfirm(v => !v), placeholder: "Repeat new password", auto: "new-password" },
            ].map(field => (
              <div key={field.label} className="space-y-1.5">
                <Label>{field.label}</Label>
                <div className="relative">
                  <Input
                    type={field.show ? "text" : "password"}
                    value={field.value}
                    onChange={e => field.set(e.target.value)}
                    placeholder={field.placeholder}
                    autoComplete={field.auto}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={field.toggle}>
                    {field.show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
            <Button onClick={handleChangePassword} disabled={changingPwd || !currentPwd || !newPwd || !confirmPwd}>
              {changingPwd ? "Updating..." : "Update Password"}
            </Button>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent>
            <Separator className="mb-4" />
            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={() => signOut()}
            >
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
