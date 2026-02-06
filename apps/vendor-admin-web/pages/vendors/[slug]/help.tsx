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

export default function VendorHelpPage({ vendorSlug, vendorName }: VendorHelpPageProps) {
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

          <div className="help-accordion">
            <details className="help-accordion-item" open>
              <summary className="help-accordion-summary">Your storefront</summary>
              <div className="help-accordion-body">
                <p>
                  Your customer store is at <strong>{vendorSlug}.countrtop.com</strong>. Share this
                  link so customers can browse your menu and place orders. In the sidebar, use{' '}
                  <strong>View Store</strong> to open it in a new tab.
                </p>
              </div>
            </details>

            <details className="help-accordion-item" open>
              <summary className="help-accordion-summary">Enabling online ordering</summary>
              <div className="help-accordion-body">
                <p>
                  Go to <a href={`/vendors/${vendorSlug}/locations`}>Locations</a>, click a location
                  to edit it, then under <strong>Online ordering</strong> check the box to enable
                  ordering for that location. Set <strong>Lead time</strong> (minimum minutes before
                  pickup) and <strong>Store hours</strong> for when orders can be placed. Square
                  payments must be activated first (see Square payments activation below).
                </p>
              </div>
            </details>

            <details className="help-accordion-item">
              <summary className="help-accordion-summary">Store hours and lead time</summary>
              <div className="help-accordion-body">
                <p>
                  <strong>Store hours</strong> are set per location under Locations → edit location →
                  Store hours. Enter hours per day (e.g. 9:00 AM–5:00 PM) or mark a day Closed.
                  Customers can only place orders when the store is open.
                </p>
                <p>
                  <strong>Lead time</strong> is the minimum number of minutes between when an order
                  is placed and the earliest pickup time. For example, 15 minutes means a customer
                  cannot choose a pickup time sooner than 15 minutes from now.
                </p>
              </div>
            </details>

            <details className="help-accordion-item">
              <summary className="help-accordion-summary">Square payments activation</summary>
              <div className="help-accordion-body">
                <p>
                  Your Square account must be activated for production card payments before you can
                  enable online ordering. On your Dashboard, check the <strong>Payments
                  Activated</strong> status. If it is not yet activated, complete setup in your{' '}
                  <a href="https://squareup.com/dashboard" target="_blank" rel="noopener noreferrer">Square Dashboard</a>{' '}
                  (business info and bank account), then use <strong>Re-check Square Activation</strong> on
                  the CountrTop Dashboard.
                </p>
              </div>
            </details>

            <details className="help-accordion-item">
              <summary className="help-accordion-summary">How to enable scheduled orders</summary>
              <div className="help-accordion-body">
                <p>
                  Scheduled orders let customers choose a future pickup time. To enable:
                </p>
                <ol>
                  <li>Go to <a href={`/vendors/${vendorSlug}/locations`}>Locations</a> and click a location to edit it</li>
                  <li>Under <strong>Online ordering</strong>, ensure online ordering is enabled</li>
                  <li>Check <strong>Scheduled Orders (customers pick future pickup time)</strong></li>
                  <li>Set <strong>Max days in advance</strong> (e.g. 7) and <strong>Slot size</strong> (15, 30, or 60 minutes)</li>
                  <li>Click <strong>Save</strong></li>
                </ol>
                <p>
                  Customers will then see a date and time picker at checkout, and the chosen pickup
                  time appears on the KDS ticket.
                </p>
              </div>
            </details>

            <details className="help-accordion-item">
              <summary className="help-accordion-summary">How the KDS works</summary>
              <div className="help-accordion-body">
                <p>
                  The <strong>KDS</strong> (Kitchen Display System) shows orders from your CountrTop
                  online store and from your POS (e.g. Square) in one place.
                </p>
                <h3>How staff use it</h3>
                <p>
                  Open <a href="https://kds.countrtop.com" target="_blank" rel="noopener noreferrer">kds.countrtop.com</a>{' '}
                  on a tablet or browser. Enter your vendor slug, choose the location, then the
                  4-digit PIN for that location. Tap tickets to move them: <strong>In Progress</strong> →{' '}
                  <strong>Ready</strong> → <strong>Complete</strong>.
                </p>
                <h3>Locations and PINs</h3>
                <p>
                  Each location has its own PIN, set under <strong>Locations</strong>. Kitchen staff
                  need that PIN to see that location&apos;s orders.
                </p>
                <h3>When you&apos;re online</h3>
                <p>
                  New orders appear within seconds. When the internet drops, the KDS shows the last
                  loaded orders and queues status changes until you&apos;re back online.
                </p>
                <p className="cta">
                  <a href="https://kds.countrtop.com" target="_blank" rel="noopener noreferrer" className="kds-link">
                    Open KDS →
                  </a>
                </p>
              </div>
            </details>

            <details className="help-accordion-item">
              <summary className="help-accordion-summary">KDS icon legend</summary>
              <div className="help-accordion-body">
                <p>In the minimized KDS header, these icons appear:</p>
                <ul>
                  <li><strong>Status icon</strong> (next to vendor name): Realtime, Offline, or Polling</li>
                  <li><strong>Analytics</strong>: Prep times, throughput, order stats</li>
                  <li><strong>Settings</strong>: Display preferences (full vs minimized nav, sound alerts)</li>
                  <li><strong>Time Clock</strong>: Clock in and out with a 3-digit PIN</li>
                  <li><strong>Recall</strong>: Bring a completed ticket back to the queue</li>
                </ul>
              </div>
            </details>

            <details className="help-accordion-item">
              <summary className="help-accordion-summary">KDS ticket actions</summary>
              <div className="help-accordion-body">
                <p>
                  Use the <strong>⋮</strong> menu on a ticket for:
                </p>
                <ul>
                  <li><strong>Hold</strong> — Pause the ticket (e.g. waiting for customer)</li>
                  <li><strong>Add note / Edit note</strong> — Staff notes visible on the ticket</li>
                  <li><strong>Rename</strong> — Custom label (e.g. &quot;Table 5&quot;, &quot;John&apos;s order&quot;)</li>
                  <li><strong>Move up / Move down</strong> — Reorder in the queue</li>
                </ul>
              </div>
            </details>

            <details className="help-accordion-item">
              <summary className="help-accordion-summary">Online vs POS orders and shortcodes</summary>
              <div className="help-accordion-body">
                <p>
                  Tickets show a badge: <strong>Online</strong> (from CountrTop) or <strong>POS</strong> (from
                  your register). Each ticket has an auto-generated <strong>shortcode</strong> (e.g. A3F2)—a
                  unique 4-character code per location so staff can call out orders quickly.
                </p>
              </div>
            </details>

            <details className="help-accordion-item">
              <summary className="help-accordion-summary">Get support</summary>
              <div className="help-accordion-body">
                <p>
                  Go to <a href={`/vendors/${vendorSlug}/support`}>Support</a> to submit a ticket.
                  Enter a subject and message; we&apos;ll respond via email. You can also view past
                  tickets there.
                </p>
              </div>
            </details>
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

          .help-accordion {
            display: flex;
            flex-direction: column;
            gap: 0;
          }

          .help-accordion-item {
            border: 1px solid var(--color-border);
            border-radius: 10px;
            margin-bottom: 10px;
            overflow: hidden;
          }

          .help-accordion-item:last-child {
            margin-bottom: 0;
          }

          .help-accordion-summary {
            cursor: pointer;
            list-style: none;
            font-size: 16px;
            font-weight: 600;
            padding: 14px 16px;
            color: var(--ct-text);
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .help-accordion-summary::-webkit-details-marker {
            display: none;
          }

          .help-accordion-summary::before {
            content: '▾';
            font-size: 12px;
            color: var(--color-text-muted);
            transition: transform 0.2s;
            flex-shrink: 0;
          }

          .help-accordion-item[open] .help-accordion-summary::before {
            transform: rotate(-90deg);
          }

          .help-accordion-summary:hover {
            background: var(--color-bg-warm);
          }

          .help-accordion-body {
            padding: 0 16px 16px;
            border-top: 1px solid var(--color-border);
          }

          .help-accordion-body h3 {
            font-size: 16px;
            font-weight: 600;
            margin: 20px 0 8px;
            color: var(--ct-text);
          }

          .help-accordion-body h3:first-child {
            margin-top: 16px;
          }

          .help-accordion-body p {
            margin: 0 0 12px;
            line-height: 1.6;
            color: var(--ct-text);
          }

          .help-accordion-body a {
            color: var(--color-primary);
            text-decoration: none;
          }

          .help-accordion-body a:hover {
            text-decoration: underline;
          }

          .help-accordion-body ul,
          .help-accordion-body ol {
            margin: 0 0 16px;
            padding-left: 24px;
            line-height: 1.6;
          }

          .help-accordion-body li {
            margin-bottom: 8px;
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
