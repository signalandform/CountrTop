import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

export default function LoginPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const hasCheckedSession = useRef(false);

  useEffect(() => {
    // Prevent multiple session checks
    if (hasCheckedSession.current) return;
    hasCheckedSession.current = true;

    const client = getBrowserSupabaseClient();
    setSupabase(client);

    if (client) {
      // Check if user is already logged in
      // Only redirect if we have a valid session with a user ID
      client.auth.getSession().then(({ data: { session }, error }) => {
        if (error || !session?.user?.id) {
          // No valid session, show login form
          setLoading(false);
          return;
        }
        
        // Have a valid session - redirect directly to vendor orders to avoid root page loop
        setTimeout(() => {
          window.location.replace('/vendors/sunset/orders');
        }, 100);
      }).catch(() => {
        // If session check fails, just show login form
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

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
      } else if (data.session?.user?.id) {
        // Success - redirect directly to vendor orders page to avoid root page redirect loop
        // Wait a moment for session cookies to be set
        setTimeout(() => {
          // Redirect directly to sunset vendor orders (bypassing root page)
          window.location.replace('/vendors/sunset/orders');
        }, 200);
      } else {
        setError('Sign in succeeded but no session was returned');
        setSigningIn(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
      setSigningIn(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!supabase || !email) {
      setError('Please enter your email address first');
      return;
    }

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setResetEmailSent(true);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    }
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Sign In – CountrTop Admin</title>
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
          <title>Sign In – CountrTop Admin</title>
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
        <title>Sign In – CountrTop Admin</title>
      </Head>
      <main className="login-page">
        <div className="login-container">
          <h1>CountrTop Vendor Admin</h1>
          <p className="subtitle">Sign in to access vendor admin</p>
          
          {resetEmailSent ? (
            <div className="reset-message">
              <p>Check your email for a password reset link.</p>
              <button onClick={() => setResetEmailSent(false)} className="btn-link">
                Back to sign in
              </button>
            </div>
          ) : (
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
              {error && <p className="error">{error}</p>}
              <button type="submit" className="btn-signin" disabled={signingIn}>
                {signingIn ? 'Signing in...' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="btn-forgot"
                disabled={signingIn}
              >
                Forgot password?
              </button>
            </form>
          )}
        </div>

        <style jsx>{`
          .login-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 24px;
          }

          .login-container {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 48px;
            text-align: center;
            max-width: 400px;
            width: 100%;
          }

          h1 {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            color: #888;
            margin: 0 0 32px;
            font-size: 16px;
          }

          .btn-signin {
            width: 100%;
            padding: 14px 24px;
            border-radius: 12px;
            border: none;
            background: #4285f4;
            color: white;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.2s;
            font-family: inherit;
          }

          .btn-signin:hover:not(:disabled) {
            background: #357ae8;
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
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-size: 16px;
            font-family: inherit;
            transition: border-color 0.2s;
          }

          .input-field:focus {
            outline: none;
            border-color: #667eea;
          }

          .input-field:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .input-field::placeholder {
            color: #888;
          }

          .btn-forgot {
            width: 100%;
            margin-top: 12px;
            padding: 8px;
            background: transparent;
            border: none;
            color: #888;
            font-size: 14px;
            cursor: pointer;
            text-decoration: underline;
            font-family: inherit;
            transition: color 0.2s;
          }

          .btn-forgot:hover:not(:disabled) {
            color: #ccc;
          }

          .btn-forgot:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .reset-message {
            text-align: center;
          }

          .reset-message p {
            color: #ccc;
            margin-bottom: 16px;
          }

          .btn-link {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #e8e8e8;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            transition: background 0.2s;
          }

          .btn-link:hover {
            background: rgba(255, 255, 255, 0.05);
          }

          .error {
            color: #fca5a5;
            margin: 8px 0;
            font-size: 14px;
            text-align: left;
          }
        `}</style>
      </main>
    </>
  );
}

