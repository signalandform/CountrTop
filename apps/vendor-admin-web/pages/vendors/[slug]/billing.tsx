import type { GetServerSideProps } from 'next';
import { useState, useEffect } from 'react';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';
import type { Vendor, BillingPlanId } from '@countrtop/models';

type VendorBillingPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

type BillingData = {
  planId: BillingPlanId;
  planName: string;
  amountCents: number;
  interval: 'month' | 'year' | null;
  status: string;
  currentPeriodEnd: string | null;
  paymentMethod: { brand: string; last4: string } | null;
  canUpgrade: boolean;
};

type InvoiceItem = {
  id: string;
  amountPaid: number;
  status: string;
  pdfUrl: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
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
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBilling = async () => {
      try {
        const res = await fetch(`/api/vendors/${vendorSlug}/billing`, { credentials: 'include' });
        const data = await res.json();
        if (data.success && data.data) {
          setBilling(data.data);
        } else {
          setError(data.error ?? 'Failed to load billing');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load billing');
      } finally {
        setLoading(false);
      }
    };
    fetchBilling();
  }, [vendorSlug]);

  useEffect(() => {
    if (!vendor) return;
    const fetchInvoices = async () => {
      try {
        const res = await fetch(`/api/vendors/${vendorSlug}/billing/invoices`, { credentials: 'include' });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setInvoices(data.data);
        }
      } catch {
        // Non-fatal
      } finally {
        setInvoicesLoading(false);
      }
    };
    fetchInvoices();
  }, [vendorSlug, vendor]);

  const handleManagePaymentMethod = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendorSlug}/billing/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? 'Failed to open portal');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open portal');
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSubscribe = async (plan: 'starter' | 'pro') => {
    setCheckoutLoading(plan);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendorSlug}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan })
      });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? 'Failed to start checkout');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start checkout');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const formatPrice = (cents: number) => {
    if (cents === 0) return '$0';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

  const planFeatures: Record<BillingPlanId, string[]> = {
    beta: [
      'KDS: ticket flow New → In Progress → Ready → Complete, order recall',
      'Employee clock in/out',
      'Customer notifications when order is ready',
      'Basic analytics, single location, employee timesheets',
      'Custom pickup instructions, basic support',
      'Your storefront: yourname.countrtop.com',
      'POS integration, email notifications'
    ],
    trial: [
      'Same as Beta during trial'
    ],
    starter: [
      'Everything in Beta',
      'Advanced analytics',
      'Customer loyalty program',
      'Scheduled orders',
      'Custom branding (logo, colors)'
    ],
    pro: [
      'Everything in Starter',
      'Multiple locations',
      'Multiple KDS screens',
      'Role-based staff accounts'
    ]
  };

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
            Manage your plan and payment method.
          </p>

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          {loading ? (
            <p className="muted">Loading billing…</p>
          ) : (
            <div className="billing-sections">
              <section className="billing-card ct-card">
                <h2 className="section-title">Current plan</h2>
                {billing ? (
                  <>
                    <div className="plan-name">{billing.planName}</div>
                    <div className="plan-price">
                      {formatPrice(billing.amountCents)}
                      {billing.interval && <span className="plan-interval">/{billing.interval}</span>}
                    </div>
                    {billing.currentPeriodEnd && (
                      <p className="muted">Next billing: {formatDate(billing.currentPeriodEnd)}</p>
                    )}
                    {planFeatures[billing.planId]?.length > 0 && (
                      <ul className="plan-features-list">
                        {planFeatures[billing.planId].map((feature, i) => (
                          <li key={i}>{feature}</li>
                        ))}
                      </ul>
                    )}
                    {billing.canUpgrade && (
                      <div className="upgrade-actions">
                        <button
                          type="button"
                          className="btn-upgrade"
                          disabled={!!checkoutLoading}
                          onClick={() => handleSubscribe('starter')}
                        >
                          {checkoutLoading === 'starter' ? 'Redirecting…' : 'Upgrade to Starter ($49/mo)'}
                        </button>
                        <button
                          type="button"
                          className="btn-upgrade btn-upgrade-pro"
                          disabled={!!checkoutLoading}
                          onClick={() => handleSubscribe('pro')}
                        >
                          {checkoutLoading === 'pro' ? 'Redirecting…' : 'Upgrade to Pro ($99/mo)'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="muted">—</p>
                )}
              </section>

              <section className="billing-card ct-card">
                <h2 className="section-title">Payment method</h2>
                {billing?.paymentMethod ? (
                  <p className="muted">
                    {billing.paymentMethod.brand} •••• {billing.paymentMethod.last4}
                  </p>
                ) : (
                  <p className="muted">No payment method on file.</p>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={portalLoading}
                  onClick={handleManagePaymentMethod}
                >
                  {portalLoading ? 'Opening…' : 'Manage payment method'}
                </button>
              </section>

              <section className="billing-card ct-card billing-card-full">
                <h2 className="section-title">Invoices</h2>
                {invoicesLoading ? (
                  <p className="muted">Loading…</p>
                ) : invoices.length === 0 ? (
                  <p className="muted">No invoices yet.</p>
                ) : (
                  <ul className="invoices-list">
                    {invoices.map((inv) => (
                      <li key={inv.id} className="invoice-item">
                        <span className="invoice-date">{formatDate(inv.createdAt)}</span>
                        <span className="invoice-amount">{formatPrice(inv.amountPaid)}</span>
                        <span className="invoice-status">{inv.status}</span>
                        {inv.pdfUrl && (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="invoice-pdf">
                            PDF
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
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

          .error-banner {
            padding: 12px 16px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            color: #dc2626;
            font-size: 14px;
            margin-bottom: 20px;
          }

          .billing-sections {
            display: grid;
            grid-template-columns: repeat(2, minmax(280px, 1fr));
            gap: 20px;
          }

          .billing-card {
            padding: 20px;
            border-radius: var(--ct-card-border-radius, 16px);
            border: 1px solid var(--ct-card-border, #e5e7eb);
            background: var(--ct-bg-surface, #fff);
          }

          .billing-card-full {
            grid-column: 1 / -1;
          }

          .section-title {
            margin: 0 0 12px;
            font-size: 16px;
            font-weight: 600;
          }

          .plan-name {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 4px;
          }

          .plan-price {
            font-size: 20px;
            color: var(--ct-text-muted);
          }

          .plan-interval {
            font-size: 14px;
            font-weight: 500;
          }

          .plan-features-list {
            margin: 12px 0 0;
            padding-left: 20px;
            font-size: 14px;
            color: var(--ct-text-muted);
            line-height: 1.5;
          }

          .plan-features-list li {
            margin-bottom: 4px;
          }

          .upgrade-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 16px;
          }

          .btn-upgrade {
            padding: 10px 16px;
            border-radius: 8px;
            border: none;
            background: var(--ct-gradient-primary, linear-gradient(135deg, #e85d04, #f48c06));
            color: white;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
          }

          .btn-upgrade:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          .btn-upgrade-pro {
            background: linear-gradient(135deg, #1e3a5f, #2563eb);
          }

          .btn-secondary {
            padding: 10px 16px;
            border-radius: 8px;
            border: 1px solid var(--ct-card-border);
            background: var(--ct-bg-surface-warm);
            color: var(--ct-text);
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            margin-top: 8px;
          }

          .btn-secondary:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          .muted {
            margin: 0;
            color: var(--ct-text-muted);
            font-size: 14px;
          }

          .invoices-list {
            list-style: none;
            margin: 0;
            padding: 0;
          }

          .invoice-item {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 12px 0;
            border-bottom: 1px solid var(--ct-card-border);
          }

          .invoice-item:last-child {
            border-bottom: none;
          }

          .invoice-date {
            flex: 0 0 120px;
            font-size: 14px;
          }

          .invoice-amount {
            flex: 0 0 80px;
            font-weight: 600;
          }

          .invoice-status {
            flex: 1;
            font-size: 13px;
            color: var(--ct-text-muted);
            text-transform: capitalize;
          }

          .invoice-pdf {
            font-size: 14px;
            color: var(--color-primary, #e85d04);
            text-decoration: none;
          }

          .invoice-pdf:hover {
            text-decoration: underline;
          }

          @media (max-width: 768px) {
            .page {
              padding: 16px;
            }
            .container {
              max-width: 100%;
            }
            .billing-card-full {
              grid-column: 1;
            }
          }
        `}</style>
      </main>
    </VendorAdminLayout>
  );
}
