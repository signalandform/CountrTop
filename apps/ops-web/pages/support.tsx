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
export default function SupportPage(_props: Props) {
  return (
    <>
      <Head>
        <title>Support Inbox – CountrTop Ops</title>
      </Head>
      <main className="page">
        <header className="page-header">
          <Link href="/" className="back-link">← Back to Dashboard</Link>
          <h1>Support Inbox</h1>
        </header>
        <div className="page-content">
          <div className="coming-soon">
            <div className="coming-soon-icon">📧</div>
            <h2>Coming Soon</h2>
            <p>Support request management will be available here.</p>
          </div>
        </div>

        <style jsx global>{`
          .page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
          }

          .page-header {
            padding: 32px 48px;
            border-bottom: 1px solid var(--color-border);
          }

          .back-link {
            display: inline-block;
            margin-bottom: 16px;
            color: var(--color-accent);
            text-decoration: none;
            font-size: 14px;
            transition: color 0.2s;
          }

          .back-link:hover {
            color: var(--color-primary);
          }

          .page-header h1 {
            font-size: 32px;
            font-weight: 700;
            margin: 0;
            background: var(--ct-gradient-primary);
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
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
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
            color: var(--color-text);
          }

          .coming-soon p {
            font-size: 16px;
            color: var(--color-text-muted);
            margin: 0;
          }
        `}</style>
      </main>
    </>
  );
}

