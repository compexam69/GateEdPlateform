import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, User, Camera, Eye, EyeOff, CheckCircle, Shield } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

  async function handleChangePassword() {
    if (!currentPwd) { toast({ title: "Enter current password", variant: "destructive" }); return; }
    if (newPwd.length < 8) { toast({ title: "Password too short", description: "At least 8 characters required.", variant: "destructive" }); return; }
    if (!/[A-Z]/.test(newPwd) || !/[a-z]/.test(newPwd) || !/[0-9]/.test(newPwd) || !/[^A-Za-z0-9]/.test(newPwd)) {
      toast({ title: "Weak password", description: "Must contain uppercase, lowercase, number, and special character.", variant: "destructive" }); return;
    }
    if (newPwd !== confirmPwd) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (newPwd === currentPwd) { toast({ title: "Same password", description: "New password must be different from current password.", variant: "destructive" }); return; }

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

        <Card className="bg-card">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center shrink-0 ring-2 ring-border">
                  <User className="w-12 h-12 text-muted-foreground" />
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors"
                  title="Change photo (requires B2 credentials)"
                >
                  <Camera className="w-4 h-4 text-white" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={() => {}} />
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
                  <Badge variant="outline" className={isAdmin ? "border-primary text-primary" : ""}>
                    {roleLabel}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current Password</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPwd}
                  onChange={e => setCurrentPwd(e.target.value)}
                  placeholder="Your current password"
                  autoComplete="current-password"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowCurrent(v => !v)}>
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="Min 8 chars, uppercase, lowercase, number, special"
                  autoComplete="new-password"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNew(v => !v)}>
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Confirm New Password</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowConfirm(v => !v)}>
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button onClick={handleChangePassword} disabled={changingPwd || !currentPwd || !newPwd || !confirmPwd}>
              {changingPwd ? "Updating..." : "Update Password"}
            </Button>
          </CardContent>
        </Card>

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
