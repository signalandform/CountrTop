import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

export default function AccessDeniedPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setSupabase(getBrowserSupabaseClient());
  }, []);

  const handleSignOut = async () => {
    if (!supabase || signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (err) {
      console.error('Sign out error:', err);
      // Still redirect to login even if sign out fails
      router.replace('/login');
    }
  };

  return (
    <>
      <Head>
        <title>Access Denied – CountrTop Ops</title>
      </Head>
      <main className="access-denied-page">
        <div className="access-denied-container">
          <h1>Access Denied</h1>
          <p className="message">
            Your email is not authorized to access the CountrTop Ops dashboard.
          </p>
          <p className="submessage">
            If you believe this is an error, please contact the CountrTop team.
          </p>
          <button onClick={handleSignOut} className="btn-signout" disabled={signingOut}>
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>

        <style jsx global>{`
          .access-denied-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 24px;
          }

          .access-denied-container {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 48px;
            text-align: center;
            max-width: 500px;
            width: 100%;
          }

          .access-denied-container h1 {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 24px;
            color: #f87171;
          }

          .message {
            font-size: 16px;
            color: #e8e8e8;
            margin: 0 0 16px;
            line-height: 1.6;
          }

          .submessage {
            font-size: 14px;
            color: #888;
            margin: 0 0 32px;
            line-height: 1.6;
          }

          .btn-signout {
            padding: 12px 24px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.2s;
            font-family: inherit;
          }

          .btn-signout:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.1);
          }

          .btn-signout:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>
      </main>
    </>
  );
}

