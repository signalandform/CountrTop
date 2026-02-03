import type { GetServerSideProps } from 'next';
import { useState, useEffect } from 'react';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';
import type { Vendor } from '@countrtop/models';
import type { SupportTicket } from '@countrtop/models';

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

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function VendorSupportPage({ vendorSlug, vendorName, vendor }: VendorSupportPageProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      setLoadingTickets(true);
      const res = await fetch(`/api/vendors/${vendorSlug}/support-tickets`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setTickets(data.tickets);
      else setTickets([]);
    } catch {
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (vendorSlug) fetchTickets();
  }, [vendorSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const sub = subject.trim();
    const msg = message.trim();
    if (!sub || !msg) {
      setError('Subject and message are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/vendors/${vendorSlug}/support-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: sub, message: msg })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit');
      if (data.success) {
        setSubject('');
        setMessage('');
        fetchTickets();
      } else throw new Error(data.error ?? 'Failed to submit');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
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
            <form onSubmit={handleSubmit}>
              {error && <p className="form-error">{error}</p>}
              <div className="form-group">
                <label htmlFor="support-subject">Subject</label>
                <input
                  id="support-subject"
                  type="text"
                  className="form-input"
                  placeholder="Brief summary"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="support-message">Message</label>
                <textarea
                  id="support-message"
                  className="form-input"
                  rows={4}
                  placeholder="Describe your issue or question"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit ticket'}
              </button>
            </form>
          </section>

          <section className="tickets-section ct-card">
            <h2 className="section-title">Your tickets</h2>
            {loadingTickets ? (
              <p className="muted">Loading tickets…</p>
            ) : tickets.length === 0 ? (
              <p className="muted">No tickets yet. Submit one above.</p>
            ) : (
              <ul className="tickets-list">
                {tickets.map((t) => (
                  <li key={t.id} className="ticket-item">
                    <button
                      type="button"
                      className="ticket-header-btn"
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    >
                      <span className="ticket-subject">{t.subject}</span>
                      <span className={`ticket-status ticket-status-${t.status}`}>{t.status}</span>
                      <span className="ticket-date">{formatDate(t.createdAt)}</span>
                    </button>
                    {expandedId === t.id && (
                      <div className="ticket-detail">
                        <p className="ticket-message">{t.message}</p>
                        {t.opsReply && (
                          <div className="ticket-reply">
                            <strong>Reply from CountrTop:</strong>
                            <p>{t.opsReply}</p>
                            {t.opsRepliedAt && (
                              <span className="ticket-reply-date">{formatDate(t.opsRepliedAt)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
            cursor: pointer;
          }

          .btn-submit:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          .form-error {
            margin: 0 0 16px;
            color: var(--ct-color-error, #dc2626);
            font-size: 14px;
          }

          .tickets-section {
            margin-top: 32px;
            padding: 24px;
            border-radius: var(--ct-card-border-radius, 20px);
            max-width: 560px;
          }

          .tickets-list {
            list-style: none;
            margin: 0;
            padding: 0;
          }

          .ticket-item {
            border: 1px solid var(--color-border);
            border-radius: 12px;
            margin-bottom: 12px;
            overflow: hidden;
          }

          .ticket-header-btn {
            width: 100%;
            padding: 14px 16px;
            text-align: left;
            border: none;
            background: var(--ct-bg-surface);
            color: var(--ct-text);
            font-family: inherit;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 12px;
          }

          .ticket-header-btn:hover {
            background: var(--color-bg-warm);
          }

          .ticket-subject {
            font-weight: 600;
            flex: 1;
            min-width: 0;
          }

          .ticket-status {
            padding: 4px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            text-transform: capitalize;
          }

          .ticket-status-open {
            background: rgba(59, 130, 246, 0.15);
            color: #60a5fa;
          }

          .ticket-status-in_progress {
            background: rgba(245, 158, 11, 0.15);
            color: #fbbf24;
          }

          .ticket-status-closed {
            background: rgba(34, 197, 94, 0.15);
            color: #86efac;
          }

          .ticket-date {
            color: var(--ct-text-muted);
            font-size: 13px;
          }

          .ticket-detail {
            padding: 16px;
            border-top: 1px solid var(--color-border);
            background: var(--ct-bg-primary);
          }

          .ticket-message {
            margin: 0 0 16px;
            white-space: pre-wrap;
            font-size: 14px;
          }

          .ticket-reply {
            margin-top: 16px;
            padding: 16px;
            background: var(--color-bg-warm);
            border-radius: 8px;
          }

          .ticket-reply strong {
            display: block;
            margin-bottom: 8px;
            font-size: 13px;
          }

          .ticket-reply p {
            margin: 0 0 8px;
            white-space: pre-wrap;
            font-size: 14px;
          }

          .ticket-reply-date {
            font-size: 12px;
            color: var(--ct-text-muted);
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
