import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
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
import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getApiBase } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function LoginPage() {
  const { signIn, sessionExpired, setSessionExpired } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (sessionExpired) {
      toast({
        title: "Session expired",
        description: "Your session has expired. Please sign in again.",
        variant: "destructive",
      });
      setSessionExpired(false);
    }
  }, [sessionExpired, setSessionExpired, toast]);

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setLoading(true);
    setShowVerificationBanner(false);
    try {
      const { error } = await signIn(values.email, values.password);
      if (error) {
        if (error.message?.toLowerCase().includes("email not confirmed")) {
          setUnverifiedEmail(values.email);
          setShowVerificationBanner(true);
        } else {
          toast({ title: "Login Failed", description: error.message || "Invalid email or password", variant: "destructive" });
        }
        return;
      }
      setLocation("/dashboard");
    } catch (error: unknown) {
      toast({ title: "Error", description: (error as Error).message || "Failed to log in", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!unverifiedEmail) return;
    setResendLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to resend email");
      }
      toast({ title: "Email Sent", description: "Verification email resent. Check your inbox." });
    } catch (error: unknown) {
      toast({ title: "Error", description: (error as Error).message || "Failed to resend email", variant: "destructive" });
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16, transition: { duration: 0.2, ease: "easeIn" } }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* Logo + brand */}
        <div className="text-center mb-8">
          <motion.div
            className="flex justify-center mb-3"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.35, ease: "easeOut" }}
          >
            <Logo size={88} />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">One Step EdPlateform</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back. Continue your learning journey.</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-6 space-y-5">

          {/* Verification banner */}
          {showVerificationBanner && (
            <motion.div
              className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.25 }}
            >
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-500">Email not verified</p>
                <p className="text-xs mt-0.5 text-amber-500/80">Verify your email before signing in.</p>
                <Button
                  variant="link"
                  size="sm"
                  className="text-amber-500 px-0 h-auto mt-1 text-xs"
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                >
                  {resendLoading ? "Sending…" : "Resend verification email"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Email address
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        inputMode="email"
                        className="h-11 bg-muted/40 border-border/60 focus:bg-background transition-colors"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between mb-1.5">
                      <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Password
                      </FormLabel>
                      <Link
                        href="/forgot-password"
                        className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          className="h-11 pr-10 bg-muted/40 border-border/60 focus:bg-background transition-colors"
                          {...field}
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold rounded-xl mt-1 transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…</>
                ) : "Log In"}
              </Button>
            </form>
          </Form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium tracking-wider">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Bottom toggle */}
          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="font-semibold text-primary hover:text-primary/80 transition-colors">
              Sign Up
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
