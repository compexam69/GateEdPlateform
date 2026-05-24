import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string | null;
  setAuth: (session: Session | null) => void;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  role: null,
  setAuth: (session) => {
    set({
      session,
      user: session?.user || null,
      role: session?.user?.user_metadata?.role || null,
      loading: false,
    })
  },
  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, role: null, loading: false })
  },
}))

// Initialize auth state
supabase.auth.getSession().then(({ data: { session } }) => {
  useAuth.getState().setAuth(session)
})

supabase.auth.onAuthStateChange((_event, session) => {
  useAuth.getState().setAuth(session)
})
