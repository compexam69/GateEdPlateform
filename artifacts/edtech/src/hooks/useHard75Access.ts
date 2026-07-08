import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { apiFetch } from "@/lib/api";

export interface Hard75Access {
  enabled: boolean;
  enabled_at: string | null;
  role: string;
}

export function useHard75Access() {
  const { session, role } = useAuth();

  const { data, isLoading } = useQuery<Hard75Access>({
    queryKey: ["hard75-access"],
    queryFn: () => apiFetch("/hard75/access") as Promise<Hard75Access>,
    enabled: !!session,
    staleTime: 60_000,
  });

  const hasAccess = role === "super_admin" || data?.enabled === true;

  return { hasAccess, isLoading, data };
}
