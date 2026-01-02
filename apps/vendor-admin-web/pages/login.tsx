import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';

import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

export default function LoginPage() {
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
        
        // Have a valid session - wait longer for cookies to be set, then query vendor
        // Don't auto-redirect if we just came from a protected page (to prevent loops)
        if (client) {
          (async () => {
            try {
              // Wait longer to ensure session cookies are fully set on the server
              await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds
              
              const response = await fetch('/api/me/vendor', {
                credentials: 'include' // Ensure cookies are sent
              });
              
              if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.error('Vendor lookup failed on page load:', response.status, errorData);
                // Don't redirect - just show error and let user try again
                setError(`Vendor lookup failed: ${errorData.error || `HTTP ${response.status}`}. Please try signing in again.`);
                setLoading(false);
                return;
              }
              
              const { slug } = await response.json();
              if (!slug) {
                console.error('No vendor slug returned on page load');
                setError('Vendor lookup succeeded but no vendor slug was returned.');
                setLoading(false);
                return;
              }
              
              // Redirect to vendor orders page
              setTimeout(() => {
                window.location.replace(`/vendors/${slug}/orders`);
              }, 100);
            } catch (err) {
              console.error('Vendor lookup error on page load:', err);
              setError(`Failed to load vendor information: ${err instanceof Error ? err.message : 'Unknown error'}. Please try signing in again.`);
              setLoading(false);
            }
          })();
        } else {
          setLoading(false);
        }
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
        // Success - wait longer for session cookies to be set, then query vendor
        try {
          // Wait longer to ensure session cookies are fully set on the server
          await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds
          
          const response = await fetch('/api/me/vendor', {
            credentials: 'include' // Ensure cookies are sent
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            const errorMessage = errorData.error || `HTTP ${response.status}`;
            console.error('Vendor lookup failed:', response.status, errorData);
            
            // Show error to user and keep it visible - don't auto-redirect
            setError(`Vendor lookup failed: ${errorMessage}. Please try refreshing the page or contact support.`);
            setSigningIn(false);
            return;
          }
          
          const { slug } = await response.json();
          if (!slug) {
            console.error('No vendor slug returned');
            setError('Vendor lookup succeeded but no vendor slug was returned. Please contact support.');
            setSigningIn(false);
            return;
          }
          
          // Redirect to vendor orders page
          setTimeout(() => {
            window.location.replace(`/vendors/${slug}/orders`);
          }, 200);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error('Vendor lookup error:', err);
          setError(`Failed to load vendor information: ${errorMessage}. Please try refreshing the page.`);
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
              {error && (
              <div className="error-container">
                <p className="error">{error}</p>
                <button 
                  onClick={() => setError(null)} 
                  className="error-dismiss"
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}
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

          .error-container {
            display: flex;
            align-items: flex-start;
            gap: 12px;
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
            flex: 1;
            font-size: 14px;
            line-height: 1.5;
            word-break: break-word;
          }

          .error-dismiss {
            background: none;
            border: none;
            color: #fca5a5;
            font-size: 24px;
            line-height: 1;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            opacity: 0.7;
            transition: opacity 0.2s;
          }

          .error-dismiss:hover {
            opacity: 1;
          }
        `}</style>
      </main>
    </>
  );
}

