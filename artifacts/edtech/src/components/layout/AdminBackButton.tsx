import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";

interface AdminBackButtonProps {
  to?: string;
  label?: string;
}

/**
 * Desktop-only "Back" button for Admin & Super Admin dashboard sub-pages.
 * Hidden on mobile (<768px) to keep small-screen headers uncluttered.
 * Defaults to navigating back to /admin (the admin hub).
 * Pass `to` and `label` props to override for deeper navigation hierarchies.
 */
export function AdminBackButton({ to = "/admin", label = "Admin Dashboard" }: AdminBackButtonProps) {
  const [, navigate] = useLocation();

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="hidden md:inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -ml-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
      aria-label={`Back to ${label}`}
    >
      <ChevronLeft className="w-4 h-4 shrink-0" />
      {label}
    </button>
  );
}
