import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'controlslab.theme';

function initial(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === 'light' ? 'light' : 'dark';
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

/** Read a CSS custom property, for canvas and WebGL code that cannot use var(). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
