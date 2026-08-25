'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type SessionUser = { id: string; email: string };

type SessionValue = {
  user: SessionUser | null;
  /** Null while the initial check is still in flight. */
  isLoading: boolean;
  refresh: (signal?: AbortSignal) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue>({
  user: null,
  isLoading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export default function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store', signal });
      const data = await res.json();
      setUser(data?.user ?? null);
    } catch {
      // Offline or misconfigured — treat as signed out rather than blocking.
      if (!signal?.aborted) setUser(null);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // The state updates happen after the await, so they never run
    // synchronously inside the effect body.
    const controller = new AbortController();
    // Every setState inside refresh() runs after an await, so none of them
    // executes synchronously within this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  return (
    <SessionContext.Provider value={{ user, isLoading, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
