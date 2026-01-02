import Head from 'next/head';
import type { GetServerSideProps } from 'next';

import { VendorInsights } from '@countrtop/models';

import { VendorInsightsDashboard } from '../../components/VendorInsightsDashboard';
import { getServerDataClient } from '../../lib/dataClient';
import { summarizeInsights } from '../../lib/insights';
import { requireVendorAdmin } from '../../lib/auth';

type VendorAdminProps = {
  vendorSlug: string;
  vendorName: string;
  insights: VendorInsights;
  statusMessage?: string | null;
};

export const getServerSideProps: GetServerSideProps<VendorAdminProps> = async (context) => {
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

  const dataClient = getServerDataClient();
  const vendor = slug ? await dataClient.getVendorBySlug(slug) : null;
  const orders = vendor ? await dataClient.listOrderSnapshotsForVendor(vendor.id) : [];
  const insights = await summarizeInsights(vendor, orders, dataClient);
  const statusMessage = vendor ? null : 'Vendor not found';

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName: vendor?.displayName ?? 'Unknown vendor',
      insights,
      statusMessage
    }
  };
};

export default function VendorAdminVendorPage({
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
