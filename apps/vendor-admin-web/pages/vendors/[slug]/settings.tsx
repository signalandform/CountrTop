import type { GetServerSideProps } from 'next';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorSettings } from '../../../components/VendorSettings';
import type { Vendor } from '@countrtop/models';

type VendorSettingsPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

export const getServerSideProps: GetServerSideProps<VendorSettingsPageProps> = async (context) => {
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

export default function VendorSettingsPage({ vendorSlug, vendorName, vendor }: VendorSettingsPageProps) {
  if (!vendor) {
    return (
      <main className="page">
        <div className="container">
          <p>Vendor not found</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container">
        <header className="page-header">
          <div className="header-top">
            <a href={`/vendors/${vendorSlug}`} className="back-link">
              ← Back to Dashboard
            </a>
          </div>
          <h1>{vendorName}</h1>
          <p>Settings</p>
        </header>
        <VendorSettings vendor={vendor} vendorSlug={vendorSlug} />
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: var(--ct-bg-primary);
          color: var(--ct-text);
          font-family: var(--ct-font-body);
          padding: 32px;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 32px;
        }

        .header-top {
          margin-bottom: 16px;
        }

        .back-link {
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
          margin: 0 0 8px 0;
          color: var(--color-text);
        }

        .page-header p {
          font-size: 16px;
          color: var(--color-text-muted);
          margin: 0;
        }
      `}</style>
    </main>
  );
}

