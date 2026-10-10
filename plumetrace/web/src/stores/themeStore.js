/**
 * OWNER    : Tanmay
 * TASK     : Zustand theme store — light (default) / dark, persisted, applies the
 *            `.dark` class on <html>. Every semantic colour token in index.css
 *            switches off this class, so toggling re-themes the whole app.
 * STATUS   : DONE
 */
import { create } from 'zustand';

const STORAGE_KEY = 'plumetrace.theme';

/** Light is the product default. We only persist an explicit user choice. */
export function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage can throw (private mode) — fall through to default */
  }
  return 'light';
}

/** Reflect the theme onto <html> (class drives the CSS variable sets). */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme; // native form controls / scrollbars follow
}

export const useThemeStore = create((set, get) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));
