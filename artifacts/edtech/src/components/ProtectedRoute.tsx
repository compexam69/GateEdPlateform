import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { session, loading, role, isApproved } = useAuth();
  const [, setLocation] = useLocation();

  const isAdmin = role === "admin" || role === "super_admin";

  useEffect(() => {
    if (!loading) {
      if (!session) {
        setLocation("/login");
      } else if (!isApproved && !isAdmin) {
        setLocation("/pending-approval");
      } else if (requireAdmin && !isAdmin) {
        setLocation("/dashboard");
      }
    }
  }, [session, loading, role, isApproved, isAdmin, requireAdmin, setLocation]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;
  if (!isApproved && !isAdmin) return null;
  if (requireAdmin && !isAdmin) return null;

  return <>{children}</>;
}
