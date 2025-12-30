import { useEffect, useState, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthUser = {
  id: string;
  email?: string | null;
};

export type AuthStatus = 'idle' | 'loading' | 'ready';

export type UseAuthOptions = {
  supabase: SupabaseClient | null;
  isNativeWebView?: boolean;
  onNativeAuthUpdate?: (user: AuthUser | null) => void;
  postToNative?: (payload: Record<string, unknown>) => void;
};

export type UseAuthReturn = {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  signIn: (provider: 'apple' | 'google') => Promise<void>;
  signOut: () => Promise<void>;
  isReady: boolean;
};

/**
 * Shared authentication hook for web applications using Supabase.
 * Consolidates auth logic including OAuth sign-in, sign-out, and session management.
 * 
 * @example
 * ```tsx
 * const supabase = getBrowserSupabaseClient();
 * const { user, status, signIn, signOut } = useAuth({
 *   supabase,
 *   isNativeWebView: false
 * });
 * ```
 */
export function useAuth(options: UseAuthOptions): UseAuthReturn {
  const { supabase, isNativeWebView = false, onNativeAuthUpdate, postToNative } = options;
  
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Initialize auth state
  useEffect(() => {
    if (!supabase) {
      setStatus('ready');
      return;
    }

    setStatus('loading');
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const sessionUser = data.session?.user ?? null;
        const authUser = sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null;
        setUser(authUser);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load session');
        setStatus('ready');
      });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      const authUser = sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null;
      setUser(authUser);
      
      // Notify native app of auth changes
      if (onNativeAuthUpdate) {
        onNativeAuthUpdate(authUser);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, onNativeAuthUpdate]);

  // Notify native app when user changes
  useEffect(() => {
    if (!isNativeWebView || !onNativeAuthUpdate) return;
    onNativeAuthUpdate(user);
  }, [user, isNativeWebView, onNativeAuthUpdate]);

  // Handle native auth token messages
  useEffect(() => {
    if (!supabase || !isNativeWebView) return;

    const handleNativeMessage = async (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      if (!raw) return;
      
      let payload: { type?: string; access_token?: string; refresh_token?: string };
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      
      if (payload?.type !== 'ct-auth-token') return;

      try {
        const { access_token, refresh_token } = payload;
        if (!access_token || !refresh_token) {
          throw new Error('Missing auth tokens from native sign-in.');
        }
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token
        });
        if (error) throw error;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to complete sign-in.');
      }
    };

    window.addEventListener('message', handleNativeMessage);
    const docAny = document as { 
      addEventListener?: (type: string, listener: EventListener) => void; 
      removeEventListener?: (type: string, listener: EventListener) => void 
    };
    docAny.addEventListener?.('message', handleNativeMessage);
    
    return () => {
      window.removeEventListener('message', handleNativeMessage);
      docAny.removeEventListener?.('message', handleNativeMessage);
    };
  }, [isNativeWebView, supabase]);

  // Handle native auth token via window function
  useEffect(() => {
    if (!supabase || !isNativeWebView) return;

    const handleToken = async (payload: { access_token?: string; refresh_token?: string }) => {
      try {
        const { access_token, refresh_token } = payload;
        if (!access_token || !refresh_token) {
          throw new Error('Missing auth tokens from native sign-in.');
        }
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token
        });
        if (error) throw error;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to complete sign-in.');
      }
    };

    (window as typeof window & { ctHandleNativeAuth?: typeof handleToken }).ctHandleNativeAuth = handleToken;

    return () => {
      const target = window as typeof window & { ctHandleNativeAuth?: typeof handleToken };
      delete target.ctHandleNativeAuth;
    };
  }, [isNativeWebView, supabase]);

  const signIn = useCallback(async (provider: 'apple' | 'google') => {
    if (!supabase) {
      setError('Supabase auth is not configured for this environment.');
      return;
    }
    
    setError(null);
    try {
      if (isNativeWebView) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: 'countrtop://auth-callback',
            skipBrowserRedirect: true
          }
        });
        if (error) throw error;
        if (!data?.url) {
          throw new Error('Unable to start sign-in in app.');
        }
        // Post to native app if callback provided
        if (postToNative) {
          postToNative({ type: 'ct-auth-url', url: data.url, provider });
        }
        return;
      }

      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start sign-in');
    }
  }, [supabase, isNativeWebView, postToNative]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign out');
    }
  }, [supabase]);

  const isReady = status === 'ready' && supabase !== null;

  return {
    user,
    status,
    error,
    signIn,
    signOut,
    isReady
  };
}

