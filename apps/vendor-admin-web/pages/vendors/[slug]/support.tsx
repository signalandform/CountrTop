import type { GetServerSideProps } from 'next';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';
import type { Vendor } from '@countrtop/models';

type VendorSupportPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

export const getServerSideProps: GetServerSideProps<VendorSupportPageProps> = async (context) => {
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

export default function VendorSupportPage({ vendorSlug, vendorName, vendor }: VendorSupportPageProps) {
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
          <h1 className="page-title">Support</h1>
          <p className="page-intro">
            Submit a support ticket and the CountrTop team will get back to you.
          </p>

          <section className="support-card ct-card">
            <h2 className="section-title">Submit a support ticket</h2>
            <p className="muted" style={{ marginBottom: 16 }}>
              Coming soon
            </p>
            <div className="form-group">
              <label htmlFor="support-subject">Subject</label>
              <input
                id="support-subject"
                type="text"
                className="form-input"
                placeholder="Brief summary"
                disabled
                readOnly
              />
            </div>
            <div className="form-group">
              <label htmlFor="support-message">Message</label>
              <textarea
                id="support-message"
                className="form-input"
                rows={4}
                placeholder="Describe your issue or question"
                disabled
                readOnly
              />
            </div>
            <button type="button" className="btn-submit" disabled>
              Submit ticket (coming soon)
            </button>
          </section>
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

          .support-card {
            padding: 24px;
            border-radius: var(--ct-card-border-radius, 20px);
            max-width: 560px;
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

          .form-group {
            margin-bottom: 16px;
          }

          .form-group label {
            display: block;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 6px;
            color: var(--ct-text);
          }

          .form-input {
            width: 100%;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--ct-text);
            font-size: 14px;
            font-family: inherit;
            box-sizing: border-box;
          }

          .form-input:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          textarea.form-input {
            resize: vertical;
            min-height: 100px;
          }

          .btn-submit {
            margin-top: 8px;
            padding: 12px 20px;
            border-radius: 12px;
            border: none;
            background: var(--ct-gradient-primary);
            color: #fff;
            font-weight: 600;
            font-size: 14px;
            cursor: not-allowed;
            opacity: 0.7;
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
