import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

export default function LoginPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const client = getBrowserSupabaseClient();
    setSupabase(client);

    if (client) {
      // Check if user is already logged in
      client.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          // Already logged in, redirect to home
          router.push('/');
        } else {
          setLoading(false);
        }
      });
    } else {
      setLoading(false);
    }
  }, [router]);

  const handleSignIn = async () => {
    if (!supabase || signingIn) return;

    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (error) {
        console.error('Sign in error:', error);
        setSigningIn(false);
      }
      // If successful, OAuth redirect will happen automatically
    } catch (error) {
      console.error('Sign in error:', error);
      setSigningIn(false);
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
          <button onClick={handleSignIn} className="btn-signin" disabled={signingIn}>
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
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

          .error {
            color: #fca5a5;
            margin-top: 16px;
          }
        `}</style>
      </main>
    </>
  );
}

