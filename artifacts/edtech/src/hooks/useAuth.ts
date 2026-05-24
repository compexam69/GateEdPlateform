import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string | null;
  isApproved: boolean;
  setAuth: (session: Session | null) => void;
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
  setAuth: (session) => {
    set({
      session,
      user: session?.user || null,
      role: session?.user?.user_metadata?.role || null,
      isApproved: session?.user?.user_metadata?.is_approved || false,
      loading: false,
    })
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
    set({ session: null, user: null, role: null, isApproved: false, loading: false })
  },
}))

supabase.auth.getSession().then(({ data: { session } }) => {
  useAuth.getState().setAuth(session)
})

supabase.auth.onAuthStateChange((_event, session) => {
  useAuth.getState().setAuth(session)
})
