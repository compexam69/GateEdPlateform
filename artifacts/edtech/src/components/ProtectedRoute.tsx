import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { session, loading, role } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading) {
      if (!session) {
        setLocation("/login");
      } else if (requireAdmin && role !== "admin" && role !== "super_admin") {
        setLocation("/dashboard");
      }
    }
  }, [session, loading, role, requireAdmin, setLocation]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;
  if (requireAdmin && role !== "admin" && role !== "super_admin") return null;

  return <>{children}</>;
}
