import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';
import type { Vendor } from '@countrtop/models';

type VendorHelpPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

export const getServerSideProps: GetServerSideProps<VendorHelpPageProps> = async (context) => {
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

export default function VendorHelpPage({ vendorSlug, vendorName, vendor }: VendorHelpPageProps) {
  return (
    <VendorAdminLayout vendorSlug={vendorSlug} vendorName={vendorName}>
      <Head>
        <title>Help - {vendorName}</title>
      </Head>
      <main className="page">
        <div className="container">
          <h1 className="page-title">Help</h1>
          <p className="intro">
            Quick guides to get the most out of CountrTop. More topics coming soon.
          </p>

          <section className="help-section">
            <h2>How the KDS works</h2>
            <p>
              The <strong>KDS</strong> (Kitchen Display System) is a screen in the kitchen that shows
              orders as they come in—from your CountrTop online store and from your POS (e.g.
              Square).
            </p>
            <h3>How staff use it</h3>
            <p>
              Open the KDS at{' '}
              <a href="https://kds.countrtop.com" target="_blank" rel="noopener noreferrer">
                kds.countrtop.com
              </a>{' '}
              on a tablet or browser. Enter your vendor slug, choose the location, then enter the
              4-digit PIN for that location. You’ll see all orders for that location. Tap tickets to
              move them through stages: <strong>New</strong> → <strong>In Progress</strong> →{' '}
              <strong>Ready</strong> → <strong>Complete</strong>.
            </p>
            <h3>Locations and PINs</h3>
            <p>
              Each location has its own PIN, set under <strong>Locations</strong> in this
              dashboard. Kitchen staff need that PIN to see that location’s orders.
            </p>
            <h3>When you’re online</h3>
            <p>
              New orders and updates appear within seconds. When the internet drops, the KDS can
              still show the last loaded orders and will queue status changes until you’re back
              online.
            </p>
            <p className="cta">
              <a
                href="https://kds.countrtop.com"
                target="_blank"
                rel="noopener noreferrer"
                className="kds-link"
              >
                Open KDS →
              </a>
            </p>
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
            max-width: 800px;
            margin: 0 auto;
          }

          .page-title {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 8px;
            color: var(--ct-text);
          }

          .intro {
            color: var(--color-text-muted);
            margin: 0 0 32px;
            font-size: 15px;
          }

          .help-section {
            margin-bottom: 40px;
          }

          .help-section h2 {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 16px;
            color: var(--ct-text);
          }

          .help-section h3 {
            font-size: 16px;
            font-weight: 600;
            margin: 24px 0 8px;
            color: var(--ct-text);
          }

          .help-section p {
            margin: 0 0 12px;
            line-height: 1.6;
            color: var(--ct-text);
          }

          .help-section a {
            color: var(--color-primary);
            text-decoration: none;
          }

          .help-section a:hover {
            text-decoration: underline;
          }

          .cta {
            margin-top: 20px !important;
          }

          .kds-link {
            display: inline-block;
            padding: 10px 16px;
            background: var(--ct-gradient-primary);
            color: white;
            border-radius: 8px;
            font-weight: 600;
            text-decoration: none;
          }

          .kds-link:hover {
            opacity: 0.9;
            text-decoration: none;
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
