import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Clock, BookOpen, Mail, LogOut } from "lucide-react";

export default function PendingApprovalPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8 text-center">

        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-500/15 border-2 border-background flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Account Pending Approval</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your account has been created successfully. An administrator needs to approve it before you can access the platform.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">What happens next</p>
          <ol className="space-y-3">
            {[
              "Our admin team reviews your registration details.",
              "You will receive an email notification once approved.",
              "Return here and sign in — your dashboard will be unlocked.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {user?.email && (
          <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
            <Mail className="w-4 h-4 shrink-0" />
            <span>Notification will be sent to <span className="font-medium text-foreground">{user.email}</span></span>
          </div>
        )}

        <Button
          variant="ghost"
          className="w-full text-muted-foreground hover:text-foreground"
          onClick={() => signOut()}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
