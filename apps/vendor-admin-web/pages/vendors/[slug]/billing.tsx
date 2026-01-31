import type { GetServerSideProps } from 'next';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';
import type { Vendor } from '@countrtop/models';

type VendorBillingPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

export const getServerSideProps: GetServerSideProps<VendorBillingPageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

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

export default function VendorBillingPage({ vendorSlug, vendorName, vendor }: VendorBillingPageProps) {
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
    <VendorAdminLayout
      vendorSlug={vendorSlug}
      vendorName={vendorName}
      vendorLogoUrl={vendor.logoUrl ?? undefined}
    >
      <main className="page">
        <div className="container">
          <h1 className="page-title">Billing</h1>
          <p className="page-intro">
            Manage your plan and payment method. Billing is coming soon.
          </p>

          <div className="billing-sections">
            <section className="billing-card ct-card">
              <h2 className="section-title">Current plan</h2>
              <p className="muted">Coming soon</p>
            </section>
            <section className="billing-card ct-card">
              <h2 className="section-title">Payment method</h2>
              <p className="muted">Coming soon</p>
            </section>
            <section className="billing-card ct-card">
              <h2 className="section-title">Invoices</h2>
              <p className="muted">Coming soon</p>
            </section>
          </div>
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

          .page-title {
            margin: 0 0 8px;
            font-size: 24px;
            font-weight: 700;
          }

          .page-intro {
            margin: 0 0 24px;
            color: var(--ct-text-muted);
            font-size: 15px;
          }

          .billing-sections {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 20px;
          }

          .billing-card {
            padding: 20px;
            border-radius: var(--ct-card-border-radius, 20px);
          }

          .section-title {
            margin: 0 0 8px;
            font-size: 16px;
            font-weight: 600;
          }

          .muted {
            margin: 0;
            color: var(--ct-text-muted);
            font-size: 14px;
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
