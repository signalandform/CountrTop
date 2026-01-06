import type { GetServerSideProps } from 'next';
import { useEffect } from 'react';
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
  const theme = vendor?.themePreference || 'dark';
  
  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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
          <h1>{vendorName}</h1>
          <p>Settings</p>
        </header>
        <VendorSettings vendor={vendor} vendorSlug={vendorSlug} />
      </div>

      <style jsx>{`
        :root {
          --bg-primary: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
          --text-primary: #e8e8e8;
          --text-muted: #888;
        }

        [data-theme="light"] {
          --bg-primary: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);
          --text-primary: #1e293b;
          --text-muted: #64748b;
        }

        .page {
          min-height: 100vh;
          background: var(--bg-primary);
          color: var(--text-primary);
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
          color: var(--text-primary);
        }

        .page-header p {
          font-size: 16px;
          color: var(--text-muted);
          margin: 0;
        }
      `}</style>
    </main>
  );
}

