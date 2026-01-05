import type { GetServerSideProps } from 'next';
import { requireVendorAdmin } from '../../../../lib/auth';
import { getServerDataClient } from '../../../../lib/dataClient';
import type { Vendor } from '@countrtop/models';

type WorkspacePageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

export const getServerSideProps: GetServerSideProps<WorkspacePageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  // Check vendor admin access
  const authResult = await requireVendorAdmin(context, slug ?? null);
  if (!authResult.authorized) {
    if (authResult.redirect) {
      return { redirect: authResult.redirect };
    }
    return {
      props: {
        vendorSlug: slug ?? 'unknown',
        vendorName: 'Access Denied',
        vendor: null
      }
    };
  }

  const dataClient = getServerDataClient();
  const vendor = slug ? await dataClient.getVendorBySlug(slug) : null;

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName: vendor?.displayName ?? 'Unknown Vendor',
      vendor: vendor ?? null
    }
  };
};

export default function WorkspacePage({ vendorSlug, vendorName }: WorkspacePageProps) {
  return (
    <main className="page">
      <div className="container">
        <header className="page-header">
          <h1>{vendorName}</h1>
          <p>Workspace</p>
        </header>

        <section className="workspace-section">
          <h2>Recipes</h2>
          <p className="placeholder">Coming soon</p>
        </section>

        <section className="workspace-section">
          <h2>Inventory Tracker</h2>
          <p className="placeholder">Coming soon</p>
        </section>

        <section className="workspace-section">
          <h2>Calendar</h2>
          <p className="placeholder">Coming soon</p>
        </section>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
          color: #e8e8e8;
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 32px;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 32px;
        }

        .page-header h1 {
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: #e8e8e8;
        }

        .page-header p {
          font-size: 16px;
          color: #888;
          margin: 0;
        }

        .workspace-section {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
        }

        .workspace-section h2 {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 16px 0;
          color: #e8e8e8;
        }

        .workspace-section .placeholder {
          color: #888;
          font-size: 14px;
          margin: 0;
        }
      `}</style>
    </main>
  );
}

