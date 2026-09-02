'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

/**
 * The document element is the source of truth: ThemeScript stamps `data-theme`
 * before paint, and the toggle writes back to it. Reading it through
 * useSyncExternalStore keeps React in sync with that external state without
 * a setState-in-effect round trip.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener('change', onChange);
  };
}

function getSnapshot(): Theme {
  const stamped = document.documentElement.getAttribute('data-theme');
  if (stamped === 'dark' || stamped === 'light') return stamped;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// The server can't know the viewer's theme; light keeps markup stable until hydration.
const getServerSnapshot = (): Theme => 'light';

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private mode / blocked storage — the toggle still works for this page view.
    }
    listeners.forEach((notify) => notify());
  }, [theme]);

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-icon !p-2"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
