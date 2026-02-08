import type { GetServerSideProps } from 'next';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorSettings } from '../../../components/VendorSettings';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';
import type { Vendor, BillingPlanId } from '@countrtop/models';

type VendorSettingsPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
  planId: BillingPlanId;
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
        vendor: null,
        planId: 'trial' as BillingPlanId
      }
    };
  }

  const dataClient = getServerDataClient();
  const vendor = slug ? await dataClient.getVendorBySlug(slug) : null;
  const billing = vendor ? await dataClient.getVendorBilling(vendor.id) : null;
  const planId: BillingPlanId = (billing?.planId as BillingPlanId) ?? 'trial';

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName: vendor?.displayName ?? 'Unknown Vendor',
      vendor: vendor ?? null,
      planId
    }
  };
};

export default function VendorSettingsPage({ vendorSlug, vendorName, vendor, planId }: VendorSettingsPageProps) {
  if (!vendor) {
    return (
      <VendorAdminLayout vendorSlug={vendorSlug} vendorName={vendorName}>
        <main className="page">
          <div className="container">
            <p>Vendor not found</p>
          </div>
        </main>
      </VendorAdminLayout>
    );
  }

  return (
    <VendorAdminLayout vendorSlug={vendorSlug} vendorName={vendorName}>
      <main className="page">
        <div className="container">
          <VendorSettings vendor={vendor} vendorSlug={vendorSlug} planId={planId} />
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

          @media (max-width: 768px) {
            .page {
              padding: 16px;
            }
            .container {
              max-width: 100%;
            }
          }
        `}</style>
      </main>
    </VendorAdminLayout>
  );
}

