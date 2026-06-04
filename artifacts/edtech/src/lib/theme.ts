export const THEMES = ['light', 'dark', 'ebony', 'carbon', 'monokai', 'amoled'] as const;
export type Theme = typeof THEMES[number];

export const THEME_STORAGE_KEY = 'edtech-theme';
export const DEFAULT_THEME: Theme = 'dark';

export interface ThemeConfig {
  label: string;
  description: string;
  swatches: { bg: string; card: string; primary: string; text: string };
}

export const THEME_CONFIGS: Record<Theme, ThemeConfig> = {
  light: {
    label: 'Light',
    description: 'Clean white workspace',
    swatches: { bg: '#f0f4f8', card: '#ffffff', primary: '#6366f1', text: '#1e293b' },
  },
  dark: {
    label: 'Dark',
    description: 'Deep slate, easy on the eyes',
    swatches: { bg: '#0f172a', card: '#1e293b', primary: '#6366f1', text: '#f1f5f9' },
  },
  ebony: {
    label: 'Ebony',
    description: 'Warm dark with amber tones',
    swatches: { bg: '#16100a', card: '#211509', primary: '#f5a623', text: '#edd9a3' },
  },
  carbon: {
    label: 'Carbon',
    description: 'Pure black with cyan accents',
    swatches: { bg: '#111111', card: '#1c1c1c', primary: '#00ccff', text: '#e6e6e6' },
  },
  monokai: {
    label: 'Monokai',
    description: 'Developer classic, vivid accents',
    swatches: { bg: '#272822', card: '#2e2e2a', primary: '#a6e22e', text: '#f8f8f2' },
  },
  amoled: {
    label: 'AMOLED Black',
    description: 'Pure black for OLED displays',
    swatches: { bg: '#000000', card: '#0d0d0d', primary: '#6366f1', text: '#f5f5f5' },
  },
};

export function isValidTheme(t: unknown): t is Theme {
  return typeof t === 'string' && (THEMES as readonly string[]).includes(t);
}

export function applyThemeToDom(theme: Theme): void {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  if (theme === 'light') {
    html.classList.remove('dark');
  } else {
    html.classList.add('dark');
  }
}

export function readThemeFromStorage(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && isValidTheme(stored)) return stored;
  } catch {
    // localStorage unavailable (private browsing, security restriction)
  }
  return DEFAULT_THEME;
}

export function writeThemeToStorage(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Best-effort — app remains functional without persistence
  }
}
