import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

export default function LoginPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hasCheckedSession = useRef(false);

  useEffect(() => {
    // Prevent multiple session checks
    if (hasCheckedSession.current) return;
    hasCheckedSession.current = true;

    const client = getBrowserSupabaseClient();
    setSupabase(client);

    if (client) {
      // Check if user is already logged in
      client.auth.getSession().then(({ data: { session }, error }) => {
        if (error || !session?.user?.id) {
          // No valid session, show login form
          setLoading(false);
          return;
        }
        
        // Have a valid session - redirect to home
        router.push('/');
      });
    } else {
      setLoading(false);
    }
  }, [router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError('Authentication not available. Please refresh the page.');
      return;
    }

    setSigningIn(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        setError(signInError.message || 'Sign in failed. Please check your credentials.');
        setSigningIn(false);
        return;
      }

      if (data.session?.user?.id) {
        // Success - set session cookies on server for server-side auth
        try {
          const setSessionResponse = await fetch('/api/auth/set-session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token
            })
          });

          if (!setSessionResponse.ok) {
            const errorData = await setSessionResponse.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Failed to set session cookies:', setSessionResponse.status, errorData);
            setError(`Login succeeded, but failed to establish session. Please try again. ${errorData.error || ''}`);
            setSigningIn(false);
            return;
          }

          // Redirect to home
          router.push('/');
        } catch (err) {
          console.error('Error setting session:', err);
          setError('Login succeeded, but failed to establish session. Please try again.');
          setSigningIn(false);
        }
      } else {
        setError('Sign in succeeded but no session was created. Please try again.');
        setSigningIn(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <main className="page">
        <div className="container">
          <p className="loading">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Login - CountrTop KDS</title>
      </Head>
      <main className="page">
        <div className="container">
          <h1 className="title">CountrTop KDS</h1>
          <p className="subtitle">Sign in to continue</p>

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
                autoComplete="email"
                disabled={signingIn}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input"
                autoComplete="current-password"
                disabled={signingIn}
              />
            </div>

            <button type="submit" className="button" disabled={signingIn}>
              {signingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }

          .container {
            max-width: 400px;
            width: 100%;
          }

          .title {
            font-size: 36px;
            font-weight: 700;
            margin: 0 0 8px;
            text-align: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 16px;
            color: #888;
            margin: 0 0 32px;
            text-align: center;
          }

          .loading {
            text-align: center;
            color: #888;
          }

          .error-banner {
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #fca5a5;
            padding: 12px 16px;
            border-radius: 12px;
            margin-bottom: 24px;
            font-size: 14px;
          }

          .form {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .form-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .form-group label {
            font-size: 14px;
            font-weight: 600;
            color: #a78bfa;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .input {
            padding: 16px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-size: 16px;
            font-family: inherit;
            transition: border-color 0.2s;
          }

          .input:focus {
            outline: none;
            border-color: #667eea;
          }

          .input:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .button {
            padding: 16px 24px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: opacity 0.2s;
            font-family: inherit;
          }

          .button:hover:not(:disabled) {
            opacity: 0.9;
          }

          .button:active:not(:disabled) {
            opacity: 0.8;
          }

          .button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>
      </main>
    </>
  );
}

