import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { OpsAdminLayout } from '../components/OpsAdminLayout';

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

export default function OpsDashboard({ userEmail }: Props) {
  return (
    <>
      <Head>
        <title>CountrTop Ops Dashboard</title>
      </Head>
      <OpsAdminLayout userEmail={userEmail}>
        <main className="dashboard-page">
          <header className="dashboard-header">
            <div>
              <h1 className="dashboard-title">CountrTop Ops</h1>
              <p className="dashboard-subtitle">Internal operations dashboard</p>
            </div>
          </header>

          <div className="dashboard-content">
            <div className="dashboard-empty">
              <p>Select a section from the sidebar to get started.</p>
            </div>
          </div>

          <style jsx>{`
            .dashboard-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 0 24px;
              border-bottom: 1px solid var(--color-border);
            }

            .dashboard-title {
              font-size: 32px;
              font-weight: 700;
              margin: 0 0 4px;
              background: var(--ct-gradient-primary);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }

            .dashboard-subtitle {
              font-size: 14px;
              color: var(--color-text-muted);
              margin: 0;
            }

            .dashboard-content {
              padding: 24px 0 0;
            }

            .dashboard-empty {
              background: var(--ct-bg-surface);
              border: 1px solid var(--ct-card-border);
              border-radius: 16px;
              padding: 24px;
              color: var(--color-text-muted);
            }
          `}</style>
        </main>
      </OpsAdminLayout>
    </>
  );
}

