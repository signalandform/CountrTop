import type { GetServerSideProps } from 'next';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { KdsAnalyticsDashboard } from '../../../components/analytics/KdsAnalyticsDashboard';
import type { Vendor } from '@countrtop/models';

type AnalyticsProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

export const getServerSideProps: GetServerSideProps<AnalyticsProps> = async (context) => {
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

export default function AnalyticsPage({ vendorSlug, vendorName, vendor }: AnalyticsProps) {
  return (
    <div className="page">
      <div className="page-content">
        <div className="header">
          <div className="header-content">
            <div className="eyebrow">Vendor Analytics</div>
            <h1 className="title">{vendorName}</h1>
            <p className="subtitle">KDS Performance Analytics</p>
          </div>
        </div>

        {vendor && (
          <KdsAnalyticsDashboard vendorSlug={vendorSlug} timezone={vendor.timezone || undefined} />
        )}
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
          color: #e8e8e8;
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 0 24px 48px;
        }

        .page-content {
          width: 100%;
        }

        @media (min-width: 1000px) {
          .page-content {
            max-width: 80vw;
            margin: 0 auto;
          }
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 48px 0 32px;
          flex-wrap: wrap;
          gap: 20px;
        }

        .header-content {
          max-width: 500px;
        }

        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 3px;
          font-size: 11px;
          color: #a78bfa;
          margin: 0 0 8px;
        }

        .title {
          font-size: 32px;
          font-weight: 800;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 8px;
          line-height: 1.2;
        }

        .subtitle {
          font-size: 16px;
          color: #888;
          margin: 0;
        }
      `}</style>
    </div>
  );
}

