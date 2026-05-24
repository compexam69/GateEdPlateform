import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, User, Camera, Eye, EyeOff, CheckCircle, Shield, X, Pencil, Phone, Bell, Mail } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

import { getApiBase, apiFetch } from "@/lib/api";

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
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      let quality = 0.9;
      const tryCompress = () => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error("Compression failed")); return; }
          if (blob.size <= maxSizeKB * 1024 || quality <= 0.3) { resolve(blob); }
          else { quality -= 0.1; tryCompress(); }
        }, "image/jpeg", quality);
      };
      tryCompress();
    };
    img.onerror = reject;
    img.src = url;
  });
}

const MOBILE_REGEX = /^(\+91)[\s-]?[6-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NotifPrefs {
  daily_plan: boolean;
  streak: boolean;
  exam_reminders: boolean;
}

const DEFAULT_PREFS: NotifPrefs = { daily_plan: true, streak: true, exam_reminders: true };

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.user_metadata?.full_name || "");
  const [savingName, setSavingName] = useState(false);

  const [editingMobile, setEditingMobile] = useState(false);
  const [newMobile, setNewMobile] = useState(user?.user_metadata?.mobile_number || "");
  const [savingMobile, setSavingMobile] = useState(false);

  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailConfirmPwd, setEmailConfirmPwd] = useState("");
  const [showEmailPwd, setShowEmailPwd] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailChangeSuccess, setEmailChangeSuccess] = useState(false);

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

  const rawPrefs = user?.user_metadata?.notification_prefs;
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    daily_plan: rawPrefs?.daily_plan ?? DEFAULT_PREFS.daily_plan,
    streak: rawPrefs?.streak ?? DEFAULT_PREFS.streak,
    exam_reminders: rawPrefs?.exam_reminders ?? DEFAULT_PREFS.exam_reminders,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  const role = user?.user_metadata?.role || "student";
  const isAdmin = role === "admin" || role === "super_admin";

  async function handleSaveName() {
    if (!newName.trim() || newName.trim().length < 2) {
      toast({ title: "Invalid name", description: "Name must be at least 2 characters.", variant: "destructive" }); return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: newName.trim() } });
      if (error) throw error;
      await supabase.from("profiles").update({ full_name: newName.trim() }).eq("id", user!.id);
      toast({ title: "Name updated!" }); setEditingName(false);
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setSavingName(false); }
  }

  async function handleSaveMobile() {
    const val = newMobile.trim();
    if (!MOBILE_REGEX.test(val)) {
      toast({ title: "Invalid mobile number", description: "Must be in format +91 followed by 10 digits starting with 6-9.", variant: "destructive" }); return;
    }
    setSavingMobile(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { mobile_number: val } });
      if (error) throw error;
      await supabase.from("profiles").update({ mobile_number: val }).eq("id", user!.id);
      toast({ title: "Mobile number updated!" }); setEditingMobile(false);
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setSavingMobile(false); }
  }

  async function handleChangeEmail() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) {
      toast({ title: "Invalid email address", variant: "destructive" }); return;
    }
    if (trimmed === user?.email?.toLowerCase()) {
      toast({ title: "Same email address", description: "New email must be different from your current email.", variant: "destructive" }); return;
    }
    if (!emailConfirmPwd) {
      toast({ title: "Password required", description: "Enter your current password to confirm the email change.", variant: "destructive" }); return;
    }
    setChangingEmail(true);
    try {
      // Re-authenticate first
      const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: user!.email!, password: emailConfirmPwd });
      if (reAuthErr) {
        toast({ title: "Wrong password", description: "Your current password is incorrect.", variant: "destructive" });
        setChangingEmail(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      setEmailChangeSuccess(true);
      setEditingEmail(false);
      setNewEmail("");
      setEmailConfirmPwd("");
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setChangingEmail(false); }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a JPG, PNG, or WEBP image.", variant: "destructive" }); return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be under 2MB.", variant: "destructive" }); return;
    }
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file, 500, 500);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const urlRes = await fetch(`${getApiBase()}/b2/profile-upload-url`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({}),
      });
      if (!urlRes.ok) {
        const errData = await urlRes.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "Failed to get upload URL");
      }
      const { upload_url, storage_path } = await urlRes.json();
      const uploadRes = await fetch(upload_url, {
        method: "POST",
        headers: { Authorization: upload_url, "Content-Type": "image/jpeg", "X-Bz-File-Name": encodeURIComponent(storage_path), "X-Bz-Content-Sha1": "do_not_verify" },
        body: compressed,
      });
      if (!uploadRes.ok) throw new Error("Upload to storage failed");
      await supabase.from("profiles").update({ photo_url: storage_path }).eq("id", user!.id);
      await supabase.auth.updateUser({ data: { photo_url: storage_path } });
      setPhotoUrl(URL.createObjectURL(compressed));
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
    try {
      await apiFetch("/b2/profile-photo", { method: "DELETE" });
    } catch { /* best-effort — profile update still proceeds */ }
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
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPwd, new_password: newPwd }),
      });
      toast({ title: "Password changed successfully!" });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err: unknown) {
      const msg = (err as Error).message || "Failed to change password";
      if (msg.includes("429") || msg.toLowerCase().includes("too many")) {
        toast({ title: "Too many attempts", description: "You can only change your password 3 times per hour.", variant: "destructive" });
      } else if (msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("wrong")) {
        toast({ title: "Wrong current password", variant: "destructive" });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } finally { setChangingPwd(false); }
  }

  async function handlePrefChange(key: keyof NotifPrefs, value: boolean) {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    setSavingPrefs(true);
    try {
      await supabase.auth.updateUser({ data: { notification_prefs: updated } });
    } catch {
      setNotifPrefs(notifPrefs);
      toast({ title: "Failed to save preference", variant: "destructive" });
    } finally { setSavingPrefs(false); }
  }

  const maskedMobile = (() => {
    const m = user?.user_metadata?.mobile_number || "";
    if (m.length >= 10) return m.slice(0, 3) + " XXXXX " + m.slice(-4);
    return m;
  })();

  const roleLabel = role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Student";
  const isEmailVerified = !!(user?.email_confirmed_at);

  const notifOptions: Array<{ key: keyof NotifPrefs; label: string; desc: string }> = [
    { key: "daily_plan", label: "Daily Study Plan", desc: "Notify when your smart study plan is generated" },
    { key: "streak", label: "Streak Reminders", desc: "Alert when your focus streak is about to break" },
    { key: "exam_reminders", label: "Exam Reminders", desc: "Reminders before scheduled tests start" },
  ];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>

        <Card className="bg-card">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center shrink-0 ring-2 ring-border overflow-hidden">
                  {photoUrl ? <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" /> : <User className="w-12 h-12 text-muted-foreground" />}
                </div>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-60" title="Change photo">
                  <Camera className="w-4 h-4 text-white" />
                </button>
                {photoUrl && (
                  <button onClick={handleRemovePhoto}
                    className="absolute top-0 right-0 w-6 h-6 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/90 transition-colors" title="Remove photo">
                    <X className="w-3 h-3 text-white" />
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
                {uploadingPhoto && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left space-y-3">
                {editingName ? (
                  <div className="flex gap-2 items-center">
                    <Input value={newName} onChange={e => setNewName(e.target.value)} className="max-w-xs" autoFocus />
                    <Button size="sm" onClick={handleSaveName} disabled={savingName}>{savingName ? "Saving..." : "Save"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <h2 className="text-2xl font-bold">{user?.user_metadata?.full_name || "Student"}</h2>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setNewName(user?.user_metadata?.full_name || ""); setEditingName(true); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                <div className="space-y-1.5">
                  {/* Email field */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <p className="text-muted-foreground">{user?.email}</p>
                      {isEmailVerified
                        ? <Badge variant="secondary" className="bg-success/10 text-success text-xs gap-1"><CheckCircle className="w-3 h-3" />Verified</Badge>
                        : <Badge variant="destructive" className="text-xs">Unverified</Badge>}
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setEditingEmail(true); setEmailChangeSuccess(false); }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </div>

                    {emailChangeSuccess && (
                      <div className="flex items-start gap-2 rounded-md bg-success/10 border border-success/20 px-3 py-2 text-xs text-success">
                        <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Verification email sent to your new address. Click the link to confirm the change.</span>
                      </div>
                    )}

                    {editingEmail && (
                      <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" />
                          A verification link will be sent to the new address. Your current email stays active until confirmed.
                        </p>
                        <div className="space-y-1.5">
                          <Label className="text-xs">New Email Address</Label>
                          <Input
                            type="email"
                            value={newEmail}
                            onChange={e => setNewEmail(e.target.value)}
                            placeholder="new@example.com"
                            className="h-8 text-sm"
                            autoFocus
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Current Password (to confirm)</Label>
                          <div className="relative">
                            <Input
                              type={showEmailPwd ? "text" : "password"}
                              value={emailConfirmPwd}
                              onChange={e => setEmailConfirmPwd(e.target.value)}
                              placeholder="Your current password"
                              className="h-8 text-sm pr-8"
                            />
                            <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowEmailPwd(v => !v)}>
                              {showEmailPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs" onClick={handleChangeEmail} disabled={changingEmail || !newEmail || !emailConfirmPwd}>
                            {changingEmail ? "Sending..." : "Send Verification"}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingEmail(false); setNewEmail(""); setEmailConfirmPwd(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Mobile field */}
                  {editingMobile ? (
                    <div className="flex gap-2 items-center">
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input value={newMobile} onChange={e => setNewMobile(e.target.value)} placeholder="+91 9876543210"
                          className="pl-8 max-w-[200px] text-sm" autoFocus />
                      </div>
                      <Button size="sm" onClick={handleSaveMobile} disabled={savingMobile}>{savingMobile ? "Saving..." : "Save"}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingMobile(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <p className="text-muted-foreground text-sm">{maskedMobile || <span className="italic">No mobile number</span>}</p>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setNewMobile(user?.user_metadata?.mobile_number || "+91 "); setEditingMobile(true); }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  {isAdmin && <Shield className="w-3.5 h-3.5 text-primary" />}
                  <Badge variant="outline" className={isAdmin ? "border-primary text-primary" : ""}>{roleLabel}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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
                  <Input type={field.show ? "text" : "password"} value={field.value} onChange={e => field.set(e.target.value)}
                    placeholder={field.placeholder} autoComplete={field.auto} />
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" /> Notification Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              System alerts (account approved, email verification) cannot be disabled.
            </p>
            {notifOptions.map(opt => (
              <div key={opt.key} className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
                <Switch
                  checked={notifPrefs[opt.key]}
                  onCheckedChange={v => handlePrefChange(opt.key, v)}
                  disabled={savingPrefs}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent>
            <Separator className="mb-4" />
            <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => signOut()}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
