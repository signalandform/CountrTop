import type { GetServerSideProps } from 'next';
import { requireVendorAdmin } from '../../../../lib/auth';
import { getServerDataClient } from '../../../../lib/dataClient';
import { AnalyticsLayout } from '../../../../components/analytics/AnalyticsLayout';
import { CustomerAnalyticsDashboard } from '../../../../components/analytics/CustomerAnalyticsDashboard';
import type { Vendor } from '@countrtop/models';

type CustomerAnalyticsProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

export const getServerSideProps: GetServerSideProps<CustomerAnalyticsProps> = async (context) => {
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

export default function CustomerAnalyticsPage({ vendorSlug, vendorName }: CustomerAnalyticsProps) {
  return (
    <AnalyticsLayout vendorSlug={vendorSlug} vendorName={vendorName} currentTab="customers">
      <CustomerAnalyticsDashboard vendorSlug={vendorSlug} />
    </AnalyticsLayout>
  );
}

