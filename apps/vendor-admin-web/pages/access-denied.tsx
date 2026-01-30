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
          background: var(--ct-bg-primary);
          color: var(--ct-text);
          font-family: var(--ct-font-body);
            padding: 24px;
          }

          .access-denied-container {
          background: var(--ct-bg-surface);
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
          color: var(--color-text-muted);
          }

          .muted {
          color: var(--color-text-muted);
            font-size: 14px;
          }

          .btn-signout {
            margin-top: 24px;
            padding: 12px 24px;
            border-radius: 12px;
          border: 1px solid var(--color-border);
          background: var(--color-bg-warm);
          color: var(--color-text);
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
            font-family: inherit;
          }

          .btn-signout:hover {
          background: rgba(232, 93, 4, 0.12);
          }
        `}</style>
      </main>
    </>
  );
}

