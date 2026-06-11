import { useCallback, useEffect, useMemo, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
type Resolved = 'light' | 'dark';

const KEY = 'tower-theme';

const systemTheme = (): Resolved =>
  matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

function readPref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [system, setSystem] = useState<Resolved>(systemTheme);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystem(systemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: Resolved = pref === 'system' ? system : pref;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    if (p === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  }, []);

  return useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref]);
}

/** Resolved CSS custom property values, for SVG charts that can't use var(). */
export function useChartColors(resolvedTheme: Resolved) {
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    return {
      income: v('--income'),
      expense: v('--expense'),
      saving: v('--saving'),
      investment: v('--investment'),
      debt: v('--debt'),
      muted: v('--muted'),
      faint: v('--faint'),
      border: v('--border'),
      text: v('--text'),
      neutral: v('--neutral-tint'),
      theme: resolvedTheme,
    };
  }, [resolvedTheme]);
}
