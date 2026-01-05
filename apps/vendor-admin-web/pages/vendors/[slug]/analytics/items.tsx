import type { GetServerSideProps } from 'next';
import { requireVendorAdmin } from '../../../../lib/auth';
import { getServerDataClient } from '../../../../lib/dataClient';
import { AnalyticsLayout } from '../../../../components/analytics/AnalyticsLayout';
import { ItemPerformanceDashboard } from '../../../../components/analytics/ItemPerformanceDashboard';
import type { Vendor } from '@countrtop/models';

type ItemAnalyticsProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

export const getServerSideProps: GetServerSideProps<ItemAnalyticsProps> = async (context) => {
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

export default function ItemAnalyticsPage({ vendorSlug, vendorName }: ItemAnalyticsProps) {
  return (
    <AnalyticsLayout vendorSlug={vendorSlug} vendorName={vendorName} currentTab="items">
      <ItemPerformanceDashboard vendorSlug={vendorSlug} />
    </AnalyticsLayout>
  );
}

