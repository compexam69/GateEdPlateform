import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { resolveAvatarUrl } from '../lib/avatarUtils'
import { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string | null;
  isApproved: boolean;
  sessionExpired: boolean;
  /**
   * Stable resolved public URL for the user's avatar.
   * Populated once on login from the profiles table.
   * Updated only after a real upload or removal — never on navigation.
   * This is the single source of truth consumed by every avatar component
   * (Sidebar, ProfilePage, etc.) to avoid per-mount re-fetches.
   */
  avatarUrl: string | null;
  setAuth: (session: Session | null) => Promise<void>;
  setSessionExpired: (expired: boolean) => void;
  /** Called by ProfilePage after a successful upload or removal. */
  setAvatarUrl: (url: string | null) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

async function fetchProfile(userId: string): Promise<{
  role: string | null;
  isApproved: boolean;
  avatarUrl: string | null;
}> {
  const { data } = await supabase
    .from('profiles')
    .select('role, is_approved, avatar_url')
    .eq('id', userId)
    .single()
  // Resolve WITHOUT a version param so the URL is stable across navigations.
  // A cache-busting ?v=<ts> is only added by ProfilePage right after an upload
  // or removal so the browser fetches the new image exactly once.
  const avatarUrl = resolveAvatarUrl((data?.avatar_url as string | null) ?? null)
  return {
    role: data?.role ?? null,
    isApproved: data?.is_approved ?? false,
    avatarUrl,
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  role: null,
  isApproved: false,
  sessionExpired: false,
  avatarUrl: null,

  setAvatarUrl: (url) => set({ avatarUrl: url }),

  setAuth: async (session) => {
    if (!session?.user) {
      set({ session: null, user: null, role: null, isApproved: false, avatarUrl: null, loading: false, sessionExpired: false })
      return
    }
    set({ loading: true })
    const { role, isApproved, avatarUrl } = await fetchProfile(session.user.id)
    set({
      session,
      user: session.user,
      role,
      isApproved,
      avatarUrl,
      loading: false,
      sessionExpired: false,
    })
  },

  setSessionExpired: (expired) => {
    set({ sessionExpired: expired, session: null, user: null, role: null, isApproved: false, avatarUrl: null, loading: false })
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data.session) {
      await get().setAuth(data.session)
    }
    return { error: error as Error | null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, role: null, isApproved: false, avatarUrl: null, loading: false, sessionExpired: false })
  },
}))

// Restore session on initial page load / tab reopen.
supabase.auth.getSession().then(({ data: { session } }) => {
  useAuth.getState().setAuth(session)
})

// Listen for auth state changes (token refresh, sign-out from another tab, etc.).
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    const wasSignedIn = !!useAuth.getState().user
    useAuth.getState().setAuth(null)
    if (wasSignedIn) {
      useAuth.getState().setSessionExpired(true)
    }
    return
  }

  // USER_UPDATED fires when user_metadata changes (name, avatar, prefs…).
  // Role/is_approved haven't changed, so skip the DB round-trip.
  // avatarUrl is already updated by ProfilePage via setAvatarUrl() before
  // calling supabase.auth.updateUser, so we preserve the current store value.
  // Only fall back to resolving from metadata if avatarUrl is still null
  // (e.g. first USER_UPDATED on a stale JWT that hadn't populated it).
  if (event === 'USER_UPDATED' && session?.user) {
    const current = useAuth.getState()
    const metaPath: string | null = session.user.user_metadata?.avatar_url ?? null
    const resolvedFromMeta = resolveAvatarUrl(metaPath)
    // Prefer the already-set store value (set by ProfilePage with cache-busting
    // version) and only fall back to resolving from metadata when store is empty.
    const newAvatarUrl = current.avatarUrl ?? resolvedFromMeta
    useAuth.setState({ user: session.user, avatarUrl: newAvatarUrl })
    return
  }

  // If this session is already in the store (signIn() already called setAuth),
  // skip to avoid a double profile-fetch / loading flicker.
  const current = useAuth.getState().session
  if (
    session?.access_token &&
    current?.access_token === session.access_token
  ) {
    return
  }

  useAuth.getState().setAuth(session)
})
