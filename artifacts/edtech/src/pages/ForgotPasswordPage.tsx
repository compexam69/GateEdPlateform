import { useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, ArrowLeft, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Reset your password</h2>
          <p className="text-muted-foreground mt-2">
            Enter your email and we'll send a secure reset link.
          </p>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-4 p-6 rounded-lg border border-success/30 bg-success/10 text-center">
            <CheckCircle className="w-10 h-10 text-success" />
            <div>
              <p className="font-semibold text-success">Reset email sent!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Check your inbox at <strong>{email}</strong>. The link expires in 1 hour.
              </p>
            </div>
            <Link href="/login">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading || !email}>
              {loading ? "Sending reset link..." : "Send reset link"}
            </Button>
          </form>
        )}

        {!sent && (
          <p className="text-center text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
