'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Link as LinkIcon } from 'lucide-react';
import type { Item } from '@/lib/types';
import { shareUrl } from '@/lib/share';

/**
 * Copies a link to this listing on OneRail, so it can be sent to someone who
 * never ran the search. The listing travels inside the link itself — see
 * `lib/share.ts` for why.
 */
export default function ShareButton({ item }: { item: Item }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const flash = (next: 'copied' | 'failed') => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2200);
  };

  const copy = async () => {
    const url = shareUrl(item, window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
      flash('copied');
    } catch {
      // Clipboard access needs a secure context and can be refused outright.
      // Selecting the text lets the reader copy it by hand instead of failing.
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand?.('copy');
      document.body.removeChild(field);
      flash(ok ? 'copied' : 'failed');
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="btn btn-secondary"
      title="Copy a link to this listing on OneRail"
    >
      {state === 'copied' ? (
        <Check size={16} className="text-[var(--ok)]" />
      ) : (
        <LinkIcon size={16} />
      )}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Press ⌘C' : 'Copy link'}
    </button>
  );
}
