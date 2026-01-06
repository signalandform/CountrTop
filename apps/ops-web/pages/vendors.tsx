import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';

import { requireOpsAdmin } from '../lib/auth';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function VendorsPage(_props: Props) {
  return (
    <>
      <Head>
        <title>Vendor Management – CountrTop Ops</title>
      </Head>
      <main className="page">
        <header className="page-header">
          <Link href="/" className="back-link">← Back to Dashboard</Link>
          <h1>Vendor Management</h1>
        </header>
        <div className="page-content">
          <div className="coming-soon">
            <div className="coming-soon-icon">🏢</div>
            <h2>Coming Soon</h2>
            <p>Vendor management features will be available here.</p>
          </div>
        </div>

        <style jsx global>{`
          .page {
            min-height: 100vh;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
          }

          .page-header {
            padding: 32px 48px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .back-link {
            display: inline-block;
            margin-bottom: 16px;
            color: #a78bfa;
            text-decoration: none;
            font-size: 14px;
            transition: color 0.2s;
          }

          .back-link:hover {
            color: #8b5cf6;
          }

          .page-header h1 {
            font-size: 32px;
            font-weight: 700;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .page-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 48px;
          }

          .coming-soon {
            text-align: center;
            padding: 64px 32px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
          }

          .coming-soon-icon {
            font-size: 64px;
            margin-bottom: 24px;
          }

          .coming-soon h2 {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 16px;
            color: #e8e8e8;
          }

          .coming-soon p {
            font-size: 16px;
            color: #888;
            margin: 0;
          }
        `}</style>
      </main>
    </>
  );
}

