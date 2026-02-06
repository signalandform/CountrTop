import type { GetServerSideProps } from 'next';
import { useState, useEffect } from 'react';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';
import { canUseCrm } from '../../../lib/planCapabilities';
import type { Vendor, BillingPlanId } from '@countrtop/models';

type CustomerEntry = {
  email: string;
  displayName?: string | null;
  orderCount: number;
};

type VendorCrmPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
  planId: BillingPlanId;
};

export const getServerSideProps: GetServerSideProps<VendorCrmPageProps> = async (context) => {
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
        vendor: null,
        planId: 'beta' as BillingPlanId
      }
    };
  }

  const dataClient = getServerDataClient();
  const vendor = slug ? await dataClient.getVendorBySlug(slug) : null;
  const billing = vendor ? await dataClient.getVendorBilling(vendor.id) : null;
  const planId: BillingPlanId = (billing?.planId as BillingPlanId) ?? 'beta';

  if (!canUseCrm(planId)) {
    return {
      redirect: {
        destination: `/vendors/${slug}/billing`,
        permanent: false
      }
    };
  }

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName: vendor?.displayName ?? 'Unknown Vendor',
      vendor: vendor ?? null,
      planId
    }
  };
};

function escapeCsvField(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadCsv(customers: CustomerEntry[]) {
  const headers = ['Email', 'Display Name', 'Order Count'];
  const rows = customers.map((c) => [
    escapeCsvField(c.email),
    escapeCsvField(c.displayName ?? ''),
    String(c.orderCount)
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `crm-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VendorCrmPage({ vendorSlug, vendorName, vendor }: VendorCrmPageProps) {
  const [customers, setCustomers] = useState<CustomerEntry[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);

  const fetchUsage = () => {
    if (!vendorSlug) return;
    fetch(`/api/vendors/${vendorSlug}/crm/usage`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setUsage(data.usage);
          setLimit(data.limit);
        }
      })
      .finally(() => setUsageLoading(false));
  };

  useEffect(() => {
    if (!vendorSlug) return;
    let cancelled = false;
    fetch(`/api/vendors/${vendorSlug}/crm/customers`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && Array.isArray(data.customers)) {
          setCustomers(data.customers);
        } else {
          setCustomersError(data.error ?? 'Failed to load customers');
        }
      })
      .catch((e) => {
        if (!cancelled) setCustomersError(e instanceof Error ? e.message : 'Failed to load customers');
      })
      .finally(() => {
        if (!cancelled) setCustomersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorSlug]);

  useEffect(() => {
    if (!vendorSlug) return;
    fetchUsage();
  }, [vendorSlug]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError(null);
    setSentCount(null);
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    if (!trimmedSubject || !trimmedBody) {
      setSendError('Subject and body are required.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/vendors/${vendorSlug}/crm/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: trimmedSubject, body: trimmedBody })
      });
      const data = await res.json();
      if (data.success) {
        setSentCount(data.sentCount ?? 0);
        setSubject('');
        setBody('');
        fetchUsage();
      } else {
        setSendError(data.error ?? 'Failed to send emails');
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
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

  const customerCount = customers.length;
  const usageNum = usage ?? 0;
  const limitNum = limit ?? 0;
  const atLimit = limitNum > 0 && usageNum >= limitNum;

  return (
    <VendorAdminLayout
      vendorSlug={vendorSlug}
      vendorName={vendorName}
      vendorLogoUrl={vendor.logoUrl ?? undefined}
    >
      <main className="page">
        <div className="container">
          <h1 className="page-title">CRM</h1>
          <p className="page-intro">
            Send one promotional email to past customers. Unsubscribes are respected and excluded from future sends.
          </p>

          {customersError && (
            <div className="error-banner">
              {customersError}
            </div>
          )}

          {customersLoading ? (
            <p className="muted">Loading customers…</p>
          ) : (
            <>
              <section className="crm-card ct-card">
                <h2 className="section-title">Recipients</h2>
                {!usageLoading && limitNum > 0 && (
                  <p className="usage-line">
                    {usageNum} of {limitNum} emails used this month.
                    {atLimit && (
                      <span className="usage-limit-msg"> Limit reached. Resets next month.</span>
                    )}
                  </p>
                )}
                <p className="muted">
                  {customerCount === 0
                    ? 'No past customers with email addresses yet. Orders from logged-in users and guests with email will appear here (excluding unsubscribes).'
                    : `${customerCount} customer${customerCount === 1 ? '' : 's'} will receive this email.`}
                </p>
                {customerCount > 0 && (
                  <div className="recipient-actions">
                    <button
                      type="button"
                      className="btn-export"
                      onClick={() => downloadCsv(customers)}
                    >
                      Export to CSV
                    </button>
                    <details className="email-list-details">
                      <summary>View emails</summary>
                    <ul className="email-list">
                      {customers.slice(0, 50).map((c) => (
                        <li key={c.email}>
                          {c.displayName ? `${c.displayName} <${c.email}>` : c.email}
                          {c.orderCount > 1 && ` (${c.orderCount} orders)`}
                        </li>
                      ))}
                      {customers.length > 50 && (
                        <li className="muted">… and {customers.length - 50} more</li>
                      )}
                    </ul>
                  </details>
                  </div>
                )}
              </section>

              <section className="crm-card ct-card">
                <h2 className="section-title">Compose email</h2>
                {sendError && (
                  <div className="error-banner">
                    {sendError}
                  </div>
                )}
                {sentCount !== null && (
                  <div className="success-banner">
                    Sent to {sentCount} customer{sentCount === 1 ? '' : 's'}.
                  </div>
                )}
                <form onSubmit={handleSend} className="compose-form">
                  <label className="field-label" htmlFor="crm-subject">
                    Subject
                  </label>
                  <input
                    id="crm-subject"
                    type="text"
                    className="field-input"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. 20% off your next order"
                    disabled={sending || customerCount === 0 || atLimit}
                  />
                  <label className="field-label" htmlFor="crm-body">
                    Message (plain text or simple HTML)
                  </label>
                  <textarea
                    id="crm-body"
                    className="field-textarea"
                    rows={10}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write your promotional message…"
                    disabled={sending || customerCount === 0 || atLimit}
                  />
                  {atLimit && (
                    <p className="usage-limit-inline">
                      CRM email limit reached for this month ({usageNum}/{limitNum}). Resets next month.
                    </p>
                  )}
                  <button
                    type="submit"
                    className="btn-send"
                    disabled={sending || customerCount === 0 || atLimit}
                  >
                    {sending ? 'Sending…' : `Send to ${customerCount} customer${customerCount === 1 ? '' : 's'}`}
                  </button>
                </form>
              </section>
            </>
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
            max-width: 800px;
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

          .success-banner {
            padding: 12px 16px;
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.3);
            border-radius: 8px;
            color: #16a34a;
            font-size: 14px;
            margin-bottom: 20px;
          }

          .crm-card {
            padding: 20px;
            border-radius: var(--ct-card-border-radius, 16px);
            border: 1px solid var(--ct-card-border, #e5e7eb);
            background: var(--ct-bg-surface, #fff);
            margin-bottom: 20px;
          }

          .section-title {
            margin: 0 0 12px;
            font-size: 16px;
            font-weight: 600;
          }

          .usage-line {
            margin: 0 0 8px;
            font-size: 14px;
          }

          .usage-limit-msg {
            color: var(--ct-text-muted);
          }

          .usage-limit-inline {
            margin: 0;
            font-size: 14px;
            color: var(--ct-text-muted);
          }

          .recipient-actions {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 12px;
            margin-top: 12px;
          }

          .btn-export {
            padding: 8px 14px;
            border-radius: 8px;
            border: 1px solid var(--ct-card-border);
            background: var(--ct-bg-surface);
            color: var(--ct-text);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          }

          .btn-export:hover {
            background: var(--ct-bg-primary);
          }

          .muted {
            margin: 0 0 12px;
            color: var(--ct-text-muted);
            font-size: 14px;
          }

          .email-list-details {
            margin-top: 12px;
          }

          .email-list-details summary {
            cursor: pointer;
            font-size: 14px;
            color: var(--color-primary, #e85d04);
          }

          .email-list {
            list-style: none;
            margin: 8px 0 0;
            padding: 0;
            font-size: 13px;
            color: var(--ct-text-muted);
          }

          .email-list li {
            padding: 4px 0;
          }

          .compose-form {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .field-label {
            font-size: 14px;
            font-weight: 600;
          }

          .field-input,
          .field-textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--ct-card-border);
            border-radius: 8px;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: inherit;
            font-size: 14px;
          }

          .field-textarea {
            min-height: 200px;
            resize: vertical;
          }

          .field-input:disabled,
          .field-textarea:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          .btn-send {
            padding: 12px 20px;
            border-radius: 8px;
            border: none;
            background: var(--ct-gradient-primary, linear-gradient(135deg, #e85d04, #f48c06));
            color: white;
            font-weight: 600;
            font-size: 15px;
            cursor: pointer;
            align-self: flex-start;
          }

          .btn-send:disabled {
            opacity: 0.7;
            cursor: not-allowed;
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
