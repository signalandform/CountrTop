import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

export default function AccessDeniedPage() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<ReturnType<typeof getBrowserSupabaseClient>>(null);

  useEffect(() => {
    setSupabase(getBrowserSupabaseClient());
  }, []);

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <>
      <Head>
        <title>Access Denied – CountrTop Admin</title>
      </Head>
      <main className="access-denied-page">
        <div className="access-denied-container">
          <h1>Access Denied</h1>
          <p>You are not authorized to access this vendor admin.</p>
          <p className="muted">Contact support if you believe this is an error.</p>
          {supabase && (
            <button onClick={handleSignOut} className="btn-signout">
              Sign Out
            </button>
          )}
        </div>

        <style jsx>{`
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
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 16px;
            padding: 48px;
            text-align: center;
            max-width: 400px;
            width: 100%;
          }

          h1 {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 16px;
            color: #fca5a5;
          }

          p {
            margin: 0 0 12px;
            font-size: 16px;
            color: #ccc;
          }

          .muted {
            color: #888;
            font-size: 14px;
          }

          .btn-signout {
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

          .btn-signout:hover {
            background: rgba(255, 255, 255, 0.1);
          }
        `}</style>
      </main>
    </>
  );
}

