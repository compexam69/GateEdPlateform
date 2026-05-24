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
  setAuth: (session: Session | null) => void;
  setSessionExpired: (expired: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (params: { email: string; password: string; options?: { data?: Record<string, unknown> } }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  role: null,
  isApproved: false,
  sessionExpired: false,
  setAuth: (session) => {
    set({
      session,
      user: session?.user || null,
      role: session?.user?.user_metadata?.role || null,
      isApproved: session?.user?.user_metadata?.is_approved || false,
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
  signUp: async ({ email, password, options }) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: options?.data,
      },
    })
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
