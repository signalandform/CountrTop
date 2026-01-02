import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { getBrowserSupabaseClient } from '../../lib/supabaseBrowser';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = getBrowserSupabaseClient();

    if (!client) {
      setStatus('error');
      setError('Authentication not configured');
      return;
    }

    const handleCallback = async () => {
      try {
        // Get the code from URL query params
        const { code } = router.query;
        if (!code || typeof code !== 'string') {
          setStatus('error');
          setError('No authorization code found');
          return;
        }

        // Exchange the code for a session
        const { data, error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        
        if (exchangeError) {
          setStatus('error');
          setError(exchangeError.message);
          return;
        }

        if (!data.session) {
          setStatus('error');
          setError('No session returned from code exchange');
          return;
        }

        // Success - redirect to home (which will redirect to vendor orders page)
        setStatus('success');
        router.push('/');
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to complete sign in');
      }
    };

    // Wait for router to be ready before accessing query params
    if (router.isReady) {
      handleCallback();
    }
  }, [router, router.isReady, router.query]);

  return (
    <>
      <Head>
        <title>Signing you in… – CountrTop Admin</title>
      </Head>
      <main className="callback-page">
        <div className="callback-container">
          {status === 'exchanging' && (
            <>
              <h1>Signing you in…</h1>
              <p className="subtitle">Please wait while we complete your sign in.</p>
            </>
          )}
          {status === 'success' && (
            <>
              <h1>Sign in successful!</h1>
              <p className="subtitle">Redirecting you now…</p>
            </>
          )}
          {status === 'error' && (
            <>
              <h1 className="error">Sign in failed</h1>
              <p className="subtitle error-text">{error ?? 'An error occurred during sign in.'}</p>
              <button onClick={() => router.push('/login')} className="btn-retry">
                Try again
              </button>
            </>
          )}
        </div>

        <style jsx>{`
          .callback-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 24px;
          }

          .callback-container {
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

          h1.error {
            color: #fca5a5;
            background: none;
            -webkit-background-clip: unset;
            -webkit-text-fill-color: unset;
            background-clip: unset;
          }

          .subtitle {
            color: #888;
            margin: 0;
            font-size: 16px;
          }

          .error-text {
            color: #fca5a5;
          }

          .btn-retry {
            margin-top: 24px;
            padding: 12px 24px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
            font-family: inherit;
          }

          .btn-retry:hover {
            background: rgba(255, 255, 255, 0.1);
          }
        `}</style>
      </main>
    </>
  );
}

