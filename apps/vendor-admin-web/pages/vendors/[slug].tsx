import Head from 'next/head';
import type { GetServerSideProps } from 'next';

import { VendorInsights } from '@countrtop/models';

import { VendorInsightsDashboard } from '../../components/VendorInsightsDashboard';
import { getServerDataClient } from '../../lib/dataClient';
import { summarizeInsights } from '../../lib/insights';

type VendorAdminProps = {
  vendorSlug: string;
  vendorName: string;
  insights: VendorInsights;
  statusMessage?: string | null;
};

export const getServerSideProps: GetServerSideProps<VendorAdminProps> = async ({ params }) => {
  const slugParam = params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

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
