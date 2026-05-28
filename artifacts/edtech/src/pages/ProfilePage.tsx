import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, User, Eye, EyeOff, CheckCircle, Shield, Pencil, Phone, Bell, Mail, Download, ImagePlus, Trash2, X, ZoomIn } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { PhotoCropModal } from "@/components/PhotoCropModal";

import { apiFetch, getApiBase } from "@/lib/api";

const MOBILE_REGEX = /^(\+91)[\s-]?[6-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Supabase Storage avatar helper ─────────────────────────────────────────
// Profile photos now live in Supabase Storage ("avatars" bucket, public).
// avatar_url in the profile holds the storage path: "<userId>/photo.jpg".
// Public URLs are permanent — no signing, no expiry, no cache needed.
// Old B2 paths (users/<id>/profile/photo.jpg) are treated as absent so the
// user simply re-uploads once.
// `version` is appended as ?v=<n> to bust the browser/CDN cache after an
// upload or delete.  Pass undefined to get the base public URL.
function resolveAvatarDisplayUrl(path: string | null, version?: number): string | null {
  if (!path) return null;
  if (path.startsWith("blob:") || path.startsWith("http")) return path;
  // Legacy B2 path — cannot be resolved without B2 credentials in the browser
  if (path.startsWith("users/")) return null;
  // Supabase Storage path: "<userId>/photo.jpg"
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  if (!data.publicUrl) return null;
  return version != null ? `${data.publicUrl}?v=${version}` : data.publicUrl;
}

interface NotifPrefs {
  daily_plan: boolean;
  streak: boolean;
  exam_reminders: boolean;
}

const DEFAULT_PREFS: NotifPrefs = { daily_plan: true, streak: true, exam_reminders: true };

export default function ProfilePage() {
  const { user, signOut, role } = useAuth();
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

  const storedAvatarPath: string | null = user?.user_metadata?.avatar_url || null;

  // Stable cache-buster ref — initialised to Date.now() on each mount so
  // revisiting the page always fetches the latest image from the origin
  // (bypasses stale browser / CDN cache).  Bumped after each upload or delete.
  const avatarVersionRef = useRef<number>(Date.now());

  // Supabase Storage public URLs are permanent and resolve synchronously.
  // We append ?v=<version> to bust the browser cache after mutations.
  const [photoUrl, setPhotoUrl] = useState<string | null>(() =>
    resolveAvatarDisplayUrl(storedAvatarPath, avatarVersionRef.current)
  );
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string>("");
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [viewerImgLoaded, setViewerImgLoaded] = useState(false);
  const [viewerImgError, setViewerImgError] = useState(false);

  // Refs for imperative gesture handling (no state = no re-renders during drag)
  const viewerRef = useRef<HTMLDivElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const rafRef = useRef<number | null>(null);
  const gestureRef = useRef({
    startY: 0,
    startX: 0,
    startTime: 0,
    delta: 0,
    dragging: false,
    // Direction lock: determined after 10px dead zone
    locked: false,
    lockAxis: null as "v" | "h" | null,
  });
  // Tracks whether a meaningful drag occurred so that the tap-to-close onClick is
  // NOT triggered after a snap-back swipe.
  const wasDraggingRef = useRef(false);

  // Apply drag visuals directly to DOM nodes — zero React re-renders
  const applyGestureVisuals = useCallback((delta: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const viewer = viewerRef.current;
      const img = imgContainerRef.current;
      const closeBtn = closeBtnRef.current;
      const hint = hintRef.current;
      if (!viewer || !img) return;
      const d = Math.max(0, delta);
      viewer.style.opacity = String(Math.max(0.15, 1 - d / 300));
      img.style.transition = "none";
      img.style.transform = `translateY(${d}px)`;
      if (closeBtn) closeBtn.style.opacity = String(Math.max(0, 1 - d / 120));
      if (hint) hint.style.opacity = String(Math.max(0, 1 - d / 60));
    });
  }, []);

  // Snap back with smooth spring animation
  const resetGestureVisuals = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const viewer = viewerRef.current;
    const img = imgContainerRef.current;
    const closeBtn = closeBtnRef.current;
    const hint = hintRef.current;
    if (!viewer || !img) return;
    img.style.transition = "transform 0.3s cubic-bezier(0.22,1,0.36,1)";
    img.style.transform = "translateY(0)";
    viewer.style.transition = "opacity 0.3s ease";
    viewer.style.opacity = "1";
    if (closeBtn) { closeBtn.style.transition = "opacity 0.3s ease"; closeBtn.style.opacity = "1"; }
    if (hint) { hint.style.transition = "opacity 0.3s ease"; hint.style.opacity = "1"; }
  }, []);

  // Imperative touch listeners: passive:false on touchmove so we CAN call
  // preventDefault(), suppressing pull-to-refresh AND overscroll bounce.
  useEffect(() => {
    if (!photoViewerOpen) return;
    const el = viewerRef.current;
    if (!el) return;

    // Lock body scroll / pull-to-refresh while viewer is open
    const prevOverscroll = document.body.style.overscrollBehavior;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return; // ignore multi-touch
      gestureRef.current = {
        startY: e.touches[0].clientY,
        startX: e.touches[0].clientX,
        startTime: Date.now(),
        delta: 0,
        dragging: false,
        locked: false,
        lockAxis: null,
      };
      wasDraggingRef.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const g = gestureRef.current;
      const dy = e.touches[0].clientY - g.startY;
      const dx = Math.abs(e.touches[0].clientX - g.startX);

      // ── Direction-lock dead zone (10 px) ──────────────────────────────
      // Don't decide axis until the finger has moved at least 10 px in any
      // direction. This means tiny / incidental touches never get captured.
      if (!g.locked) {
        const dist = Math.hypot(dy, dx);
        if (dist < 10) return; // still inside dead zone — pass through freely
        g.locked = true;
        // Vertical if downward movement dominates, otherwise horizontal.
        g.lockAxis = dy > 0 && dy >= dx ? "v" : "h";
      }

      // ── Horizontal or upward gesture ─────────────────────────────────
      // Let the browser handle it natively — hardware-accelerated, no lag.
      if (g.lockAxis !== "v") return;

      // ── Confirmed downward-vertical swipe ────────────────────────────
      // Now safe to block pull-to-refresh / overscroll.
      // Works because listener is registered with passive:false.
      e.preventDefault();
      g.dragging = true;
      g.delta = dy;
      if (dy > 8) wasDraggingRef.current = true;
      applyGestureVisuals(dy);
    }

    function onTouchEnd() {
      const g = gestureRef.current;
      if (!g.dragging) return;

      const elapsed = Date.now() - g.startTime;
      // px/ms — fast flick even with small distance should dismiss
      const velocity = elapsed > 0 ? g.delta / elapsed : 0;
      const shouldClose = g.delta > 80 || (g.delta > 35 && velocity > 0.4);

      if (shouldClose) {
        // Fly out then unmount
        const img = imgContainerRef.current;
        const viewer = viewerRef.current;
        if (img && viewer) {
          img.style.transition = "transform 0.22s ease-in";
          img.style.transform = `translateY(${window.innerHeight}px)`;
          viewer.style.transition = "opacity 0.22s ease-in";
          viewer.style.opacity = "0";
        }
        setTimeout(() => setPhotoViewerOpen(false), 230);
      } else {
        resetGestureVisuals();
      }

      gestureRef.current = { ...g, dragging: false, delta: 0, locked: false, lockAxis: null };
    }

    function onTouchCancel() {
      gestureRef.current.dragging = false;
      gestureRef.current.delta = 0;
      gestureRef.current.locked = false;
      gestureRef.current.lockAxis = null;
      resetGestureVisuals();
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
      document.body.style.overscrollBehavior = prevOverscroll;
      document.body.style.overflow = prevOverflow;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [photoViewerOpen, applyGestureVisuals, resetGestureVisuals]);

  useEffect(() => {
    if (!photoViewerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPhotoViewerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [photoViewerOpen]);

  // Keep photoUrl in sync when the auth store's user_metadata changes
  // (e.g. after the USER_UPDATED event propagates the new avatar_url into the
  // Zustand store).  We read avatarVersionRef via the ref — intentionally not
  // listed in deps — so this effect only fires when storedAvatarPath changes,
  // not on every version bump (which we handle directly in the mutation paths).
  useEffect(() => {
    setPhotoUrl(resolveAvatarDisplayUrl(storedAvatarPath, avatarVersionRef.current));
  }, [storedAvatarPath]);

  // Belt-and-suspenders: fetch avatar_url from the profiles table on mount.
  // This covers the case where the Supabase session was restored from a cached
  // JWT whose user_metadata is stale (e.g. hard page refresh before the token
  // rotated after the last upload).  The profiles table is always authoritative.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const dbPath = (data?.avatar_url as string | null) ?? null;
        setPhotoUrl(resolveAvatarDisplayUrl(dbPath, avatarVersionRef.current));
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const rawPrefs = user?.user_metadata?.notification_prefs;
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    daily_plan: rawPrefs?.daily_plan ?? DEFAULT_PREFS.daily_plan,
    streak: rawPrefs?.streak ?? DEFAULT_PREFS.streak,
    exam_reminders: rawPrefs?.exam_reminders ?? DEFAULT_PREFS.exam_reminders,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // role is read from the profiles table via useAuth (authoritative, not JWT metadata)
  const effectiveRole = role ?? "student";
  const isAdmin = effectiveRole === "admin" || effectiveRole === "super_admin";
  // Only super_admin may edit their own protected fields (name, email, mobile)
  // Admins and students have immutable protected fields on their own profile
  const canEditOwnProfile = effectiveRole === "super_admin";

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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a JPG, PNG, or WEBP image.", variant: "destructive" });
      return;
    }
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
    setCropOpen(true);
  }

  function handleCropClose() {
    setCropOpen(false);
    if (cropSrc) {
      URL.revokeObjectURL(cropSrc);
      setCropSrc("");
    }
  }

  async function handleCropConfirm(blob: Blob) {
    setCropOpen(false);
    if (cropSrc) {
      URL.revokeObjectURL(cropSrc);
      setCropSrc("");
    }
    setUploadingPhoto(true);
    // Show blob URL immediately for zero-latency visual feedback
    const blobUrl = URL.createObjectURL(blob);
    setPhotoUrl(blobUrl);
    try {
      // Upload directly to Supabase Storage — handles CORS natively, no proxy needed.
      // "avatars" is a public bucket; upsert:true overwrites any previous photo.
      const storagePath = `${user!.id}/photo.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(storagePath, blob, { contentType: "image/jpeg", upsert: true });
      if (uploadErr) throw new Error(uploadErr.message);

      // Persist the Supabase Storage path in the profile table and JWT metadata
      await supabase.from("profiles").update({ avatar_url: storagePath }).eq("id", user!.id);
      await supabase.auth.updateUser({ data: { avatar_url: storagePath } });
      // Transition from the temporary blob URL to the permanent Storage URL.
      // Bump the cache-buster so the browser doesn't serve the old cached photo.
      avatarVersionRef.current = Date.now();
      URL.revokeObjectURL(blobUrl);
      const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(storagePath);
      if (publicData.publicUrl) {
        setPhotoUrl(`${publicData.publicUrl}?v=${avatarVersionRef.current}`);
      }
      toast({ title: "Photo updated!" });
    } catch (err: unknown) {
      // On failure, revert to the previous URL (or null)
      setPhotoUrl(resolveAvatarDisplayUrl(storedAvatarPath, avatarVersionRef.current));
      URL.revokeObjectURL(blobUrl);
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRemovePhoto() {
    setPhotoUrl(null);
    avatarVersionRef.current = Date.now();
    try {
      // Remove from Supabase Storage bucket
      if (storedAvatarPath && !storedAvatarPath.startsWith("users/")) {
        await supabase.storage.from("avatars").remove([storedAvatarPath]);
      }
    } catch { /* best-effort — profile clear still proceeds */ }
    // Clear in profiles table and JWT metadata
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", user!.id);
    await supabase.auth.updateUser({ data: { avatar_url: null } });
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

  const maskedMobile = user?.user_metadata?.mobile_number || "";

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
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Profile Settings</h1>

        <Card className="bg-card">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="relative shrink-0">
                {/* Avatar circle */}
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center ring-2 ring-border overflow-hidden">
                  {photoUrl ? <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" /> : <User className="w-12 h-12 text-muted-foreground" />}
                </div>

                {/* Pencil / Edit button */}
                <button
                  onClick={() => { if (!uploadingPhoto) setPhotoMenuOpen(v => !v); }}
                  disabled={uploadingPhoto}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  title="Edit photo"
                  aria-haspopup="menu"
                  aria-expanded={photoMenuOpen}
                >
                  <Pencil className="w-3.5 h-3.5 text-white" />
                </button>

                {/* Action popup */}
                {photoMenuOpen && (
                  <>
                    {/* Transparent backdrop — closes popup on outside click */}
                    <div
                      className="fixed inset-0 z-40"
                      aria-hidden="true"
                      onClick={() => setPhotoMenuOpen(false)}
                    />
                    {/* Menu panel */}
                    <div
                      role="menu"
                      className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+10px)] z-50 min-w-[188px] rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
                    >
                      {/* View Photo — only shown when a photo exists */}
                      {photoUrl && (
                        <>
                          <button
                            role="menuitem"
                            onClick={() => {
                              setPhotoMenuOpen(false);
                              setViewerImgLoaded(false);
                              setViewerImgError(false);
                              setPhotoViewerOpen(true);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-left hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:bg-muted/60"
                          >
                            <ZoomIn className="w-4 h-4 text-primary shrink-0" />
                            <span>View Photo</span>
                          </button>
                          <div className="h-px bg-border mx-3" />
                        </>
                      )}

                      {/* Upload / Update Photo */}
                      <button
                        role="menuitem"
                        onClick={() => { setPhotoMenuOpen(false); fileInputRef.current?.click(); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-sm text-left hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:bg-muted/60"
                      >
                        <ImagePlus className="w-4 h-4 text-primary shrink-0" />
                        <span>{photoUrl ? "Update Photo" : "Upload Photo"}</span>
                      </button>

                      {/* Delete Photo — only shown when a photo exists */}
                      {photoUrl && (
                        <>
                          <div className="h-px bg-border mx-3" />
                          <button
                            role="menuitem"
                            onClick={() => { setPhotoMenuOpen(false); handleRemovePhoto(); }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4 shrink-0" />
                            <span>Delete Photo</span>
                          </button>
                        </>
                      )}

                      {/* Edit Details — Super Admin only */}
                      {canEditOwnProfile && (
                        <>
                          <div className="h-px bg-border mx-3 mt-1" />
                          <div className="px-4 pt-2.5 pb-1">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">Edit Details</p>
                          </div>
                          <button
                            role="menuitem"
                            onClick={() => {
                              setPhotoMenuOpen(false);
                              setNewName(user?.user_metadata?.full_name || "");
                              setEditingName(true);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:bg-muted/60"
                          >
                            <User className="w-4 h-4 text-primary shrink-0" />
                            <span>Edit Name</span>
                          </button>
                          <button
                            role="menuitem"
                            onClick={() => {
                              setPhotoMenuOpen(false);
                              setEditingEmail(true);
                              setEmailChangeSuccess(false);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:bg-muted/60"
                          >
                            <Mail className="w-4 h-4 text-primary shrink-0" />
                            <span>Edit Email</span>
                          </button>
                          <button
                            role="menuitem"
                            onClick={() => {
                              setPhotoMenuOpen(false);
                              setNewMobile(user?.user_metadata?.mobile_number || "+91 ");
                              setEditingMobile(true);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:bg-muted/60"
                          >
                            <Phone className="w-4 h-4 text-primary shrink-0" />
                            <span>Edit Mobile</span>
                          </button>
                          <div className="pb-1" />
                        </>
                      )}
                    </div>
                  </>
                )}

                {/* Hidden file input — unchanged */}
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelect} />

                {/* Upload spinner overlay */}
                {uploadingPhoto && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 w-full text-center sm:text-left space-y-3">
                {editingName && canEditOwnProfile ? (
                  <div className="flex gap-2 items-center">
                    <Input value={newName} onChange={e => setNewName(e.target.value)} className="max-w-xs" autoFocus />
                    <Button size="sm" onClick={handleSaveName} disabled={savingName}>{savingName ? "Saving..." : "Save"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center sm:justify-start min-w-0">
                    <h2 className="text-2xl font-bold truncate min-w-0">{user?.user_metadata?.full_name || "Student"}</h2>
                  </div>
                )}

                <div className="space-y-1.5">
                  {/* Email field */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 justify-center sm:justify-start min-w-0">
                      <p className="text-muted-foreground text-sm truncate min-w-0 flex-1">{user?.email}</p>
                      {isEmailVerified
                        ? <Badge variant="secondary" className="bg-success/10 text-success text-xs gap-1 shrink-0"><CheckCircle className="w-3 h-3" />Verified</Badge>
                        : <Badge variant="destructive" className="text-xs shrink-0">Unverified</Badge>}
                    </div>

                    {emailChangeSuccess && (
                      <div className="flex items-start gap-2 rounded-md bg-success/10 border border-success/20 px-3 py-2 text-xs text-success">
                        <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Verification email sent to your new address. Click the link to confirm the change.</span>
                      </div>
                    )}

                    {canEditOwnProfile && editingEmail && (
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
                  {editingMobile && canEditOwnProfile ? (
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
                    <div className="flex items-center gap-2 justify-center sm:justify-start min-w-0">
                      <p className="text-muted-foreground text-sm truncate min-w-0 flex-1">{maskedMobile || <span className="italic">No mobile number</span>}</p>
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
          <CardContent className="space-y-3">
            <Separator className="mb-2" />
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={async () => {
                try {
                  const res = await fetch(`${getApiBase()}/user/export`, {
                    headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}` },
                  });
                  if (!res.ok) throw new Error("Export failed");
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `gateed-my-data-${new Date().toISOString().split("T")[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  toast({ title: "Export failed", description: "Could not download your data. Please try again.", variant: "destructive" });
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" /> Download My Data
            </Button>
            <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => signOut()}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>

      <PhotoCropModal
        open={cropOpen}
        imageSrc={cropSrc}
        onClose={handleCropClose}
        onConfirm={handleCropConfirm}
        onError={(msg) => toast({ title: "Image processing failed", description: msg, variant: "destructive" })}
      />

      {/* ── Full-screen photo viewer ── */}
      {photoViewerOpen && photoUrl && (
        <div
          ref={viewerRef}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in-0 duration-200"
          style={{
            // pan-x pinch-zoom: let the browser handle horizontal panning and
            // pinch-zoom natively (hardware-accelerated, zero JS latency).
            // We still intercept vertical swipes via passive:false touchmove
            // listeners, but only AFTER the 10px direction-lock dead zone
            // confirms it's a downward-vertical gesture. This keeps normal
            // touch response instant and smooth on all mobile browsers.
            touchAction: "pan-x pinch-zoom",
          }}
          onClick={() => {
            // Ignore the click that fires after a cancelled drag (snap-back)
            if (wasDraggingRef.current) { wasDraggingRef.current = false; return; }
            setPhotoViewerOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Profile photo viewer"
        >
          {/* Close button — opacity driven imperatively during swipe */}
          <button
            ref={closeBtnRef}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            onClick={(e) => { e.stopPropagation(); setPhotoViewerOpen(false); }}
            aria-label="Close viewer"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {/* Image container — transform driven imperatively during swipe */}
          <div
            ref={imgContainerRef}
            className="relative flex items-center justify-center p-6"
            onClick={e => e.stopPropagation()}
          >
            {/* Loading spinner */}
            {!viewerImgLoaded && !viewerImgError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}

            {/* Error fallback */}
            {viewerImgError && (
              <div className="flex flex-col items-center gap-3 text-white/60">
                <User className="w-16 h-16" />
                <p className="text-sm">Could not load photo</p>
              </div>
            )}

            {/* The photo */}
            <img
              src={photoUrl}
              alt="Profile photo"
              className={[
                "max-w-[85vw] max-h-[80vh] w-auto h-auto rounded-2xl shadow-2xl object-contain transition-opacity duration-300",
                viewerImgLoaded ? "opacity-100" : "opacity-0",
                viewerImgError ? "hidden" : "",
              ].join(" ")}
              onLoad={() => setViewerImgLoaded(true)}
              onError={() => { setViewerImgError(true); setViewerImgLoaded(true); }}
              draggable={false}
            />
          </div>

          {/* Hint text — opacity driven imperatively during swipe */}
          {viewerImgLoaded && !viewerImgError && (
            <p
              ref={hintRef}
              className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-white/40 select-none whitespace-nowrap"
            >
              Swipe down or tap outside to close
            </p>
          )}
        </div>
      )}
    </AppLayout>
  );
}
