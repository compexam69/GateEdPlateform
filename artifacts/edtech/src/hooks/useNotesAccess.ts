import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { apiFetch } from "@/lib/api";

export interface NotesAccess {
  enabled: boolean;
  enabled_at: string | null;
  role: string;
}

export function useNotesAccess() {
  const { session, role } = useAuth();

  const { data, isLoading } = useQuery<NotesAccess>({
    queryKey: ["notes-access"],
    queryFn: () => apiFetch("/notes/access") as Promise<NotesAccess>,
    enabled: !!session,
    staleTime: 60_000,
  });

  const hasAccess = role === "super_admin" || data?.enabled === true;

  return { hasAccess, isLoading, data };
}
