import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string | null;
  isApproved: boolean;
  sessionExpired: boolean;
  setAuth: (session: Session | null) => Promise<void>;
  setSessionExpired: (expired: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

async function fetchProfile(userId: string): Promise<{ role: string | null; isApproved: boolean }> {
  const { data } = await supabase
    .from('profiles')
    .select('role, is_approved')
    .eq('id', userId)
    .single()
  return {
    role: data?.role ?? null,
    isApproved: data?.is_approved ?? false,
  }
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  role: null,
  isApproved: false,
  sessionExpired: false,
  setAuth: async (session) => {
    if (!session?.user) {
      set({ session: null, user: null, role: null, isApproved: false, loading: false, sessionExpired: false })
      return
    }
    const { role, isApproved } = await fetchProfile(session.user.id)
    set({
      session,
      user: session.user,
      role,
      isApproved,
      loading: false,
      sessionExpired: false,
    })
  },
  setSessionExpired: (expired) => {
    set({ sessionExpired: expired, session: null, user: null, role: null, isApproved: false, loading: false })
  },
  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  },
  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, role: null, isApproved: false, loading: false, sessionExpired: false })
  },
}))

supabase.auth.getSession().then(({ data: { session } }) => {
  useAuth.getState().setAuth(session)
})

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    const wasSignedIn = !!useAuth.getState().user
    useAuth.getState().setAuth(null)
    if (wasSignedIn) {
      useAuth.getState().setSessionExpired(true)
    }
    return
  }
  useAuth.getState().setAuth(session)
})
