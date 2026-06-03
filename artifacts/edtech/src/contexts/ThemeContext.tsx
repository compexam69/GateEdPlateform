import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  Theme,
  DEFAULT_THEME,
  applyThemeToDom,
  readThemeFromStorage,
  writeThemeToStorage,
  isValidTheme,
} from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isSyncing: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  isSyncing: false,
});

function initTheme(): Theme {
  const stored = readThemeFromStorage();
  // Apply immediately — runs during first render, before paint
  applyThemeToDom(stored);
  return stored;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initTheme);
  const [isSyncing, setIsSyncing] = useState(false);

  const { user } = useAuth();
  // Track whether we've already fetched the Supabase preference for this session
  const syncedUserRef = useRef<string | null>(null);

  // When a user logs in, pull their stored preference from Supabase.
  // localStorage acts as the immediate cache; Supabase is the cross-device source.
  useEffect(() => {
    if (!user) {
      syncedUserRef.current = null;
      return;
    }
    // Only sync once per user session to avoid redundant round-trips
    if (syncedUserRef.current === user.id) return;
    syncedUserRef.current = user.id;

    let cancelled = false;

    async function syncFromSupabase() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('theme_preference')
          .eq('id', user!.id)
          .single();

        if (cancelled) return;
        if (error || !data?.theme_preference) return;

        const remote = data.theme_preference as unknown;
        if (!isValidTheme(remote)) return;

        // Remote wins over localStorage on fresh login (cross-device sync)
        const local = readThemeFromStorage();
        if (remote !== local) {
          applyThemeToDom(remote);
          writeThemeToStorage(remote);
          setThemeState(remote);
        }
      } catch {
        // Silently fail — localStorage value remains active
      }
    }

    syncFromSupabase();
    return () => { cancelled = true; };
  }, [user]);

  const setTheme = useCallback((newTheme: Theme) => {
    // 1. Apply to DOM instantly — zero flicker
    applyThemeToDom(newTheme);
    // 2. Persist locally — survives refresh
    writeThemeToStorage(newTheme);
    // 3. Update React state
    setThemeState(newTheme);

    // 4. Async sync to Supabase (best-effort, doesn't block UI)
    if (user) {
      setIsSyncing(true);
      supabase
        .from('profiles')
        .update({ theme_preference: newTheme } as never)
        .eq('id', user.id)
        .then(
          ({ error }) => {
            if (error) console.warn('[theme] Supabase sync failed:', error.message);
            setIsSyncing(false);
          },
          () => { setIsSyncing(false); },
        );
    }
  }, [user]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isSyncing }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
