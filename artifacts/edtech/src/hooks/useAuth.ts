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

export const useAuth = create<AuthState>((set, get) => ({
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
    // Mark loading while we fetch the profile so ProtectedRoute shows a
    // spinner instead of briefly seeing session=null and bouncing to /login.
    set({ loading: true })
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data.session) {
      // Populate the store fully before returning so that any navigation that
      // happens right after (setLocation("/dashboard")) sees a valid session.
      await get().setAuth(data.session)
    }
    return { error: error as Error | null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, role: null, isApproved: false, loading: false, sessionExpired: false })
  },
}))

// Restore session on initial page load / tab reopen.
supabase.auth.getSession().then(({ data: { session } }) => {
  useAuth.getState().setAuth(session)
})

// Listen for auth state changes (token refresh, sign-out from another tab, etc.).
// Guard: skip SIGNED_IN events whose access_token we already handled inside
// signIn() — avoids a redundant profile fetch and a loading flicker.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    const wasSignedIn = !!useAuth.getState().user
    useAuth.getState().setAuth(null)
    if (wasSignedIn) {
      useAuth.getState().setSessionExpired(true)
    }
    return
  }

  // If this session is already in the store (e.g. signIn() already called
  // setAuth), skip to avoid a double profile-fetch / loading flicker.
  const current = useAuth.getState().session
  if (
    session?.access_token &&
    current?.access_token === session.access_token
  ) {
    return
  }

  useAuth.getState().setAuth(session)
})
