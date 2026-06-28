import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { getApiBase } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Eye,
  EyeOff,
  BookOpen,
  CheckCircle,
  XCircle,
  Mail,
  RefreshCw,
  ArrowRight,
  Loader2,
} from "lucide-react";

const registerSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .regex(/^[a-zA-Z\s]+$/, "Full name must contain only letters and spaces"),
  mobile: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Must be a valid 10-digit number starting with 6–9"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase letter")
    .regex(/[a-z]/, "Must contain lowercase letter")
    .regex(/[0-9]/, "Must contain a number")
    .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type FormValues = z.infer<typeof registerSchema>;

// ── Compact password strength bar ─────────────────────────────────────────────

function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;

  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ["bg-destructive", "bg-destructive", "bg-yellow-500", "bg-yellow-500", "bg-green-500"];
  const labels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];
  const textColors = ["text-destructive", "text-destructive", "text-yellow-500", "text-yellow-500", "text-green-500"];

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-0.5">
        {checks.map((_, i) => (
          <div
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-all ${i < score ? colors[score - 1] : "bg-muted"}`}
          />
        ))}
      </div>
      <p className={`text-[10px] font-medium ${textColors[score - 1] ?? "text-muted-foreground"}`}>
        {labels[score - 1] ?? "Very Weak"}
      </p>
    </div>
  );
}

// ── Full strength checklist (shown below bar on click) ────────────────────────

function PasswordChecklist({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", valid: password.length >= 8 },
    { label: "Uppercase", valid: /[A-Z]/.test(password) },
    { label: "Lowercase", valid: /[a-z]/.test(password) },
    { label: "Number", valid: /[0-9]/.test(password) },
    { label: "Special char", valid: /[^A-Za-z0-9]/.test(password) },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
      {checks.map((c) => (
        <div key={c.label} className="flex items-center gap-1">
          {c.valid
            ? <CheckCircle className="w-2.5 h-2.5 text-green-500 shrink-0" />
            : <XCircle className="w-2.5 h-2.5 text-muted-foreground shrink-0" />}
          <span className={`text-[10px] ${c.valid ? "text-green-500" : "text-muted-foreground"}`}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Success state ─────────────────────────────────────────────────────────────

function RegistrationSuccess({ email }: { email: string }) {
  const { toast } = useToast();
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const MAX_RESENDS = 3;

  async function handleResend() {
    if (resendCount >= MAX_RESENDS) {
      toast({
        title: "Too many resend attempts",
        description: "Check your spam/junk folder, or try signing in — the link may have arrived.",
        variant: "destructive",
      });
      return;
    }
    setResendLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to resend");
      setResendCount(c => c + 1);
      toast({ title: "Email sent", description: "Verification link resent. Check your inbox and spam folder." });
    } catch (err: unknown) {
      toast({
        title: "Could not resend",
        description: (err as Error).message || "Please try again shortly.",
        variant: "destructive",
      });
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="h-screen bg-background flex flex-col items-center justify-center px-4">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16, transition: { duration: 0.2, ease: "easeIn" } }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3 ring-1 ring-primary/20">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">EdTech</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
          <div className="flex flex-col items-center text-center gap-2.5">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Check your inbox</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Verification email sent to:</p>
              <p className="text-sm font-semibold text-foreground mt-0.5 break-all">{email}</p>
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-2.5 text-sm">
            {[
              { step: "1", text: "Click the link in the verification email." },
              { step: "2", text: "Your account enters admin review (under 24 hours)." },
              { step: "3", text: "Once approved, sign in to start learning." },
            ].map(({ step, text }) => (
              <div key={step} className="flex gap-2.5">
                <div className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {step}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Didn't receive it? Check spam/junk first.
            </p>
            <Button
              variant="outline"
              className="w-full h-9 rounded-xl text-sm"
              onClick={handleResend}
              disabled={resendLoading || resendCount >= MAX_RESENDS}
            >
              {resendLoading
                ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Sending…</>
                : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Resend verification email</>}
              {resendCount > 0 && !resendLoading && (
                <span className="ml-auto text-xs text-muted-foreground">{resendCount}/{MAX_RESENDS}</span>
              )}
            </Button>
            <Link href="/login">
              <Button variant="ghost" className="w-full h-9 rounded-xl text-primary text-sm hover:text-primary/80">
                Already verified? Sign in <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Wrong email?{" "}
          <Link href="/register" className="text-primary hover:underline" onClick={() => window.location.reload()}>
            Register again
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

// ── Main Registration page ────────────────────────────────────────────────────

export default function RegisterPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [showChecklist, setShowChecklist] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", mobile: "", email: "", password: "", confirmPassword: "" },
  });

  if (registeredEmail) return <RegistrationSuccess email={registeredEmail} />;

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          full_name: values.fullName,
          mobile_number: `+91${values.mobile}`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || "Registration failed");
      setRegisteredEmail(values.email.toLowerCase().trim());
    } catch (error: unknown) {
      toast({
        title: "Registration Failed",
        description: (error as Error).message || "Failed to register",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const allValid = form.formState.isValid;

  return (
    <div className="h-screen bg-background flex items-center justify-center px-4 overflow-hidden">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16, transition: { duration: 0.2, ease: "easeIn" } }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* Logo + brand — compact */}
        <div className="text-center mb-4">
          <motion.div
            className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-2.5 ring-1 ring-primary/20"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.35, ease: "easeOut" }}
          >
            <BookOpen className="w-6 h-6 text-primary" />
          </motion.div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">EdTech</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Join students preparing for JEE, NEET &amp; GATE</p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm px-5 py-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2.5" noValidate>

              {/* Row 1: Full Name + Mobile side-by-side */}
              <div className="grid grid-cols-2 gap-2.5">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Full Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Rahul Sharma"
                          autoComplete="name"
                          autoCapitalize="words"
                          className="h-9 text-sm bg-muted/40 border-border/60 focus:bg-background transition-colors"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Mobile
                      </FormLabel>
                      <FormControl>
                        <div className="flex h-9">
                          <div className="flex items-center px-2 border border-r-0 border-input bg-muted rounded-l-md text-muted-foreground text-xs font-medium select-none shrink-0">
                            +91
                          </div>
                          <Input
                            className="rounded-l-none min-w-0 h-9 text-sm bg-muted/40 border-border/60 focus:bg-background transition-colors"
                            placeholder="98765…"
                            maxLength={10}
                            inputMode="numeric"
                            autoComplete="tel-national"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>

              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Email address
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        inputMode="email"
                        className="h-9 text-sm bg-muted/40 border-border/60 focus:bg-background transition-colors"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />

              {/* Password */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Password
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Create a strong password"
                          autoComplete="new-password"
                          className="h-9 pr-9 text-sm bg-muted/40 border-border/60 focus:bg-background transition-colors"
                          {...field}
                          onFocus={() => setShowChecklist(true)}
                          onChange={(e) => { field.onChange(e); setPasswordValue(e.target.value); }}
                        />
                        <button
                          type="button"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setShowPassword(v => !v)}
                          tabIndex={-1}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </FormControl>
                    {passwordValue && (
                      <>
                        <PasswordStrengthBar password={passwordValue} />
                        {showChecklist && <PasswordChecklist password={passwordValue} />}
                      </>
                    )}
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />

              {/* Confirm Password */}
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Confirm Password
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showConfirm ? "text" : "password"}
                          placeholder="Repeat your password"
                          autoComplete="new-password"
                          className="h-9 pr-9 text-sm bg-muted/40 border-border/60 focus:bg-background transition-colors"
                          {...field}
                        />
                        <button
                          type="button"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setShowConfirm(v => !v)}
                          tabIndex={-1}
                          aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                        >
                          {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-10 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] mt-0.5"
                disabled={loading || !allValid}
              >
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Creating account…</>
                ) : "Sign Up"}
              </Button>
            </form>
          </Form>

          {/* Divider */}
          <div className="flex items-center gap-3 mt-3.5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] text-muted-foreground font-medium tracking-wider">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Bottom toggle */}
          <p className="text-center text-sm text-muted-foreground mt-3">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:text-primary/80 transition-colors">
              Log In
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
