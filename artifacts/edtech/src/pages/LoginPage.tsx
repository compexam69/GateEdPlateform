import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
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
import { Eye, EyeOff, AlertCircle, BookOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function LoginPage() {
  const { signIn } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
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
      const { error } = await supabase.auth.resend({ type: "signup", email: unverifiedEmail });
      if (error) throw error;
      toast({ title: "Email Sent", description: "Verification email resent. Check your inbox." });
    } catch (error: unknown) {
      toast({ title: "Error", description: (error as Error).message || "Failed to resend email", variant: "destructive" });
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
          <p className="text-muted-foreground mt-2">Sign in to continue your learning journey</p>
        </div>

        {showVerificationBanner && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-warning/30 bg-warning/10 text-warning">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">Email not verified</p>
              <p className="text-xs mt-0.5 text-warning/80">Please verify your email before logging in.</p>
              <Button
                variant="link"
                size="sm"
                className="text-warning px-0 h-auto mt-1 text-xs"
                onClick={handleResendVerification}
                disabled={resendLoading}
              >
                {resendLoading ? "Sending..." : "Resend verification email"}
              </Button>
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
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
                  <div className="flex items-center justify-between">
                    <FormLabel>Password</FormLabel>
                    <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        {...field}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(v => !v)}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Form>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create one for free
          </Link>
        </p>
      </div>
    </div>
  );
}
