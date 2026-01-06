import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useState } from 'react';

import { requireOpsAdmin } from '../lib/auth';
import { getBrowserSupabaseClient } from '../lib/supabaseBrowser';

type Props = {
  userEmail: string;
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const authResult = await requireOpsAdmin(context);
  if (!authResult.authorized) {
    if (authResult.redirect) {
      return { redirect: authResult.redirect };
    }
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }

  return {
    props: {
      userEmail: authResult.userEmail
    }
  };
};

export default function OpsDashboard({ userEmail }: Props) {
  const [supabase] = useState(() => getBrowserSupabaseClient());

  const handleSignOut = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  return (
    <>
      <Head>
        <title>CountrTop Ops Dashboard</title>
      </Head>
      <main className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <h1 className="dashboard-title">CountrTop Ops</h1>
            <p className="dashboard-subtitle">Internal operations dashboard</p>
          </div>
          <div className="header-actions">
            <span className="user-email">{userEmail}</span>
            <button onClick={handleSignOut} className="btn-signout">
              Sign out
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="dashboard-grid">
            <Link href="/vendors" className="dashboard-card">
              <div className="card-icon">🏢</div>
              <h2 className="card-title">Vendor Management</h2>
              <p className="card-description">
                Manage vendors, onboarding, settings, and feature flags
              </p>
            </Link>

            <Link href="/support" className="dashboard-card">
              <div className="card-icon">📧</div>
              <h2 className="card-title">Support Inbox</h2>
              <p className="card-description">
                View and manage support requests
              </p>
            </Link>

            <Link href="/health" className="dashboard-card">
              <div className="card-icon">💚</div>
              <h2 className="card-title">System Health</h2>
              <p className="card-description">
                Monitor system health and performance
              </p>
            </Link>
          </div>
        </div>

        <style jsx global>{`
          .dashboard-page {
            min-height: 100vh;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
          }

          .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 32px 48px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .dashboard-title {
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 4px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .dashboard-subtitle {
            font-size: 14px;
            color: #888;
            margin: 0;
          }

          .header-actions {
            display: flex;
            align-items: center;
            gap: 16px;
          }

          .user-email {
            font-size: 14px;
            color: #888;
          }

          .btn-signout {
            padding: 8px 16px;
            border-radius: 8px;
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

          .dashboard-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 48px;
          }

          .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
          }

          .dashboard-card {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 32px;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .dashboard-card:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(102, 126, 234, 0.3);
            transform: translateY(-2px);
          }

          .card-icon {
            font-size: 48px;
            margin-bottom: 16px;
          }

          .card-title {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 8px;
            color: #e8e8e8;
          }

          .card-description {
            font-size: 14px;
            color: #888;
            margin: 0;
            line-height: 1.5;
          }

          @media (max-width: 768px) {
            .dashboard-header {
              flex-direction: column;
              align-items: flex-start;
              gap: 16px;
            }

            .dashboard-content {
              padding: 24px;
            }

            .dashboard-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </main>
    </>
  );
}

