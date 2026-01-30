import Head from 'next/head';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const client = getBrowserSupabaseClient();
    setSupabase(client);

    if (client) {
      // Clear any stale sessions first to prevent refresh token errors
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          // Valid session - check if we should redirect
          if (session?.user) {
            // Set session cookies on server, then redirect
            fetch('/api/auth/set-session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({
                access_token: session.access_token,
                refresh_token: session.refresh_token
              })
            }).then((response) => {
              if (response.ok) {
                setTimeout(() => {
                  window.location.href = '/';
                }, 300);
              } else {
                setLoading(false);
              }
            }).catch(() => {
              setLoading(false);
            });
          }
        } else if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
          // Session cleared or user updated
          setLoading(false);
        }
      });

      // Check if user is already logged in
      client.auth.getSession().then(async ({ data: { session }, error }) => {
        if (error) {
          // If there's an error (like invalid refresh token), clear the session
          console.warn('Session check error:', error.message);
          await client.auth.signOut();
          setLoading(false);
        } else if (session?.user) {
          // Already logged in - set session cookies on server, then redirect
          try {
            const setSessionResponse = await fetch('/api/auth/set-session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({
                access_token: session.access_token,
                refresh_token: session.refresh_token
              })
            });

            if (setSessionResponse.ok) {
              await new Promise(resolve => setTimeout(resolve, 300));
              window.location.href = '/';
            } else {
              setLoading(false);
            }
          } catch {
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      }).catch(async (err) => {
        // If there's an error getting the session, clear it
        console.warn('Failed to get session:', err);
        if (client) {
          await client.auth.signOut();
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || signingIn || !email || !password) return;

    setSigningIn(true);
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (signInError) {
        setError(signInError.message);
        setSigningIn(false);
      } else if (data.session?.user) {
        // Success - set session cookies on server, then redirect
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
            setError(`Failed to set session: ${errorData.error || `HTTP ${setSessionResponse.status}`}. Please try again.`);
            setSigningIn(false);
            return;
          }

          // Wait a moment for cookies to be set
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Use window.location for full page reload to ensure getServerSideProps runs properly
          // This prevents "Loading initial props cancelled" errors
          window.location.href = '/';
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to set session');
          setSigningIn(false);
        }
      } else {
        setError('Sign in succeeded but no session was returned');
        setSigningIn(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Sign In – CountrTop Ops</title>
        </Head>
        <main className="login-page">
          <div className="login-container">
            <p>Loading…</p>
          </div>
        </main>
      </>
    );
  }

  if (!supabase) {
    return (
      <>
        <Head>
          <title>Sign In – CountrTop Ops</title>
        </Head>
        <main className="login-page">
          <div className="login-container">
            <h1>Sign In</h1>
            <p className="error">Authentication not configured</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Sign In – CountrTop Ops</title>
      </Head>
      <main className="login-page">
        <div className="login-container">
          <h1>CountrTop Ops</h1>
          <p className="subtitle">Internal operations dashboard</p>
          
          <form onSubmit={handleSignIn} className="login-form">
            <div className="form-group">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
                disabled={signingIn}
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
                disabled={signingIn}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="error-container">
                <p className="error">{error}</p>
              </div>
            )}
            <button type="submit" className="btn-signin" disabled={signingIn}>
              {signingIn ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <style jsx global>{`
          .login-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
            padding: 24px;
          }

          .login-container {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            padding: 48px;
            text-align: center;
            max-width: 400px;
            width: 100%;
          }

          .login-container h1 {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 8px;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            color: var(--color-text-muted);
            margin: 0 0 32px;
            font-size: 16px;
          }

          .btn-signin {
            width: 100%;
            padding: 14px 24px;
            border-radius: 12px;
            border: none;
            background: var(--ct-gradient-primary);
            color: white;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: opacity 0.2s;
            font-family: inherit;
          }

          .btn-signin:hover:not(:disabled) {
            opacity: 0.9;
          }

          .btn-signin:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .login-form {
            width: 100%;
          }

          .form-group {
            margin-bottom: 16px;
          }

          .input-field {
            width: 100%;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--color-text);
            font-size: 16px;
            font-family: inherit;
            transition: border-color 0.2s;
            box-sizing: border-box;
          }

          .input-field:focus {
            outline: none;
            border-color: var(--color-primary);
          }

          .input-field:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .input-field::placeholder {
            color: var(--color-text-muted);
          }

          .error-container {
            margin: 16px 0;
            padding: 12px 16px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            text-align: left;
          }

          .error {
            color: #fca5a5;
            margin: 0;
            font-size: 14px;
            line-height: 1.5;
          }
        `}</style>
      </main>
    </>
  );
}

