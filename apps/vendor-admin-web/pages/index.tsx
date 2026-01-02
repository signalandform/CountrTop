import Head from 'next/head';
import type { GetServerSideProps } from 'next';

import { resolveVendorSlugFromHost } from '@countrtop/data';
import { VendorInsights } from '@countrtop/models';

import { VendorInsightsDashboard } from '../components/VendorInsightsDashboard';
import { getServerDataClient } from '../lib/dataClient';
import { summarizeInsights } from '../lib/insights';
import { requireVendorAdmin } from '../lib/auth';

type VendorAdminProps = {
  vendorSlug: string | null;
  vendorName: string;
  insights: VendorInsights;
  statusMessage?: string | null;
};

export const getServerSideProps: GetServerSideProps<VendorAdminProps> = async (context) => {
  const defaultSlug = process.env.DEFAULT_VENDOR_SLUG;
  if (defaultSlug) {
    return {
      redirect: {
        destination: `/vendors/${defaultSlug}`,
        permanent: false
      }
    };
  }

  const vendorSlug = resolveVendorSlugFromHost(context.req.headers.host, defaultSlug);
  
  // Check vendor admin access if vendor slug exists
  if (vendorSlug) {
    const authResult = await requireVendorAdmin(context, vendorSlug);
    if (!authResult.authorized) {
      if (authResult.redirect) {
        return { redirect: authResult.redirect };
      }
      return {
        props: {
          vendorSlug: vendorSlug ?? null,
          vendorName: 'Access Denied',
          insights: {
            orders: 0,
            uniqueCustomers: 0,
            repeatCustomers: 0,
            pointsIssued: 0,
            topReorderedItems: []
          },
          statusMessage: authResult.error ?? 'Access denied'
        }
      };
    }
  }

  const dataClient = getServerDataClient();
  const vendor = vendorSlug ? await dataClient.getVendorBySlug(vendorSlug) : null;
  const orders = vendor ? await dataClient.listOrderSnapshotsForVendor(vendor.id) : [];
  const insights = await summarizeInsights(vendor, orders, dataClient);
  const statusMessage = vendorSlug && !vendor ? 'Vendor not found' : null;

  return {
    props: {
      vendorSlug: vendorSlug ?? null,
      vendorName: vendor?.displayName ?? 'Unknown vendor',
      insights,
      statusMessage
    }
  };
};

export default function VendorAdminDashboard({
  vendorSlug,
  vendorName,
  insights,
  statusMessage
}: VendorAdminProps) {
  return (
    <>
      <Head>
        <title>CountrTop Vendor Insights</title>
      </Head>
      <VendorInsightsDashboard
        vendorSlug={vendorSlug}
        vendorName={vendorName}
        insights={insights}
        statusMessage={statusMessage}
      />
    </>
  );
}
