import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
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

// ── Password strength indicator ───────────────────────────────────────────────

function PasswordStrengthIndicator({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", valid: password.length >= 8 },
    { label: "Uppercase letter", valid: /[A-Z]/.test(password) },
    { label: "Lowercase letter", valid: /[a-z]/.test(password) },
    { label: "Number", valid: /[0-9]/.test(password) },
    { label: "Special character", valid: /[^A-Za-z0-9]/.test(password) },
  ];

  const score = checks.filter(c => c.valid).length;
  const strengthColors = ["bg-destructive", "bg-destructive", "bg-yellow-500", "bg-yellow-500", "bg-green-500"];
  const strengthLabels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {checks.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all ${i < score ? strengthColors[score - 1] : "bg-muted"}`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${score >= 4 ? "text-green-500" : score >= 3 ? "text-yellow-500" : "text-destructive"}`}>
        {password ? strengthLabels[score - 1] || "Very Weak" : ""}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-1.5">
            {check.valid
              ? <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
              : <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />}
            <span className={`text-xs ${check.valid ? "text-green-500" : "text-muted-foreground"}`}>
              {check.label}
            </span>
          </div>
        ))}
      </div>
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
    <div className="min-h-svh bg-background flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand mark */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
        </div>

        {/* Success card */}
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-5">
          {/* Icon + heading */}
          <div className="flex flex-col items-center text-center gap-3 pb-2">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Check your inbox</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Account created — verification email sent to:
              </p>
              <p className="text-sm font-semibold text-foreground mt-1 break-all">{email}</p>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3 text-sm">
            {[
              { step: "1", text: "Open the verification email and click the link inside." },
              { step: "2", text: "Once verified, your account enters admin review (usually under 24 hours)." },
              { step: "3", text: "When approved, you'll receive a confirmation email and can sign in." },
            ].map(({ step, text }) => (
              <div key={step} className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {step}
                </div>
                <p className="text-muted-foreground leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          <div className="h-px bg-border" />

          {/* Didn't receive */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              Didn't receive the email? Check your spam/junk folder first.
            </p>
            <Button
              variant="outline"
              className="w-full h-10"
              onClick={handleResend}
              disabled={resendLoading || resendCount >= MAX_RESENDS}
            >
              {resendLoading
                ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                : <><RefreshCw className="w-4 h-4 mr-2" /> Resend verification email</>
              }
              {resendCount > 0 && !resendLoading && (
                <span className="ml-auto text-xs text-muted-foreground">{resendCount}/{MAX_RESENDS}</span>
              )}
            </Button>
          </div>

          {/* Sign in link */}
          <Link href="/login">
            <Button variant="ghost" className="w-full h-10 text-primary">
              Already verified? Sign in <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Wrong email?{" "}
          <Link href="/register" className="text-primary hover:underline" onClick={() => window.location.reload()}>
            Register again
          </Link>
        </p>
      </div>
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
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      mobile: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Show success screen once registration is complete
  if (registeredEmail) {
    return <RegistrationSuccess email={registeredEmail} />;
  }

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

      // Transition to the success/verification-pending screen.
      // This also prevents double-submit since the form is no longer rendered.
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
    <div className="min-h-svh bg-background overflow-y-auto">
      <div className="flex flex-col items-center justify-start min-h-svh px-4 py-10 sm:justify-center">
        <div className="w-full max-w-md space-y-6">

          {/* Brand header */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Create your account</h2>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              Join students preparing for JEE, NEET &amp; GATE
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>

                {/* Full Name */}
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Rahul Sharma"
                          autoComplete="name"
                          autoCapitalize="words"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Mobile */}
                <FormField
                  control={form.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl>
                        <div className="flex">
                          <div className="flex items-center px-3 border border-r-0 border-input bg-muted rounded-l-md text-muted-foreground text-sm font-medium select-none shrink-0">
                            +91
                          </div>
                          <Input
                            className="rounded-l-none min-w-0"
                            placeholder="9876543210"
                            maxLength={10}
                            inputMode="numeric"
                            autoComplete="tel-national"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Email */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          inputMode="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Password */}
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Create a strong password"
                            autoComplete="new-password"
                            className="pr-10"
                            {...field}
                            onChange={(e) => { field.onChange(e); setPasswordValue(e.target.value); }}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setShowPassword(v => !v)}
                            tabIndex={-1}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <PasswordStrengthIndicator password={passwordValue} />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Confirm Password */}
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirm ? "text" : "password"}
                            placeholder="Repeat your password"
                            autoComplete="new-password"
                            className="pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setShowConfirm(v => !v)}
                            tabIndex={-1}
                            aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                          >
                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-11 mt-2 text-base"
                  disabled={loading || !allValid}
                >
                  {loading ? (
                    <><div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" /> Creating account…</>
                  ) : "Create account"}
                </Button>

              </form>
            </Form>
          </div>

          {/* Sign in link */}
          <p className="text-center text-sm text-muted-foreground pb-4">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
