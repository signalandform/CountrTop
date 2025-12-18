import { useEffect, useMemo, useState } from 'react';

import { requireVendorUser, SessionManager, createSessionManager } from '@countrtop/data';

import { getDataClient } from './dataClient';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error' | 'signedOut';

let cachedManager: SessionManager | null = null;

const getSessionManager = () => {
  if (cachedManager) return cachedManager;
  cachedManager = createSessionManager({ dataClient: getDataClient() });
  return cachedManager;
};

export const useAuthSession = () => {
  const sessionManager = useMemo(() => getSessionManager(), []);
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState(() => sessionManager.getSession().user);

  useEffect(() => {
    setStatus('loading');
    sessionManager
      .bootstrap()
      .then((bootstrapUser) => {
        if (bootstrapUser) {
          try {
            requireVendorUser(bootstrapUser);
            setUser(bootstrapUser);
            setStatus('authenticated');
          } catch (err) {
            setStatus('signedOut');
            setError(err instanceof Error ? err.message : 'Unauthorized');
          }
        } else {
          setStatus('signedOut');
        }
      })
      .catch(() => {
        setStatus('signedOut');
      });

    const unsubscribe = sessionManager.subscribe((next) => {
      setUser(next.user);
    });

    return unsubscribe;
  }, [sessionManager]);

  const signIn = async (email: string, password: string) => {
    setStatus('loading');
    setError(null);
    try {
      const signedIn = await sessionManager.signInWithEmail(email, password);
      requireVendorUser(signedIn);
      setUser(signedIn);
      setStatus('authenticated');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
      await sessionManager.signOut();
    }
  };

  const signOut = async () => {
    await sessionManager.signOut();
    setUser(null);
    setStatus('signedOut');
  };

  return { user, status, error, signIn, signOut };
};
