import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useState, useEffect } from 'react';
import { OpsAdminLayout } from '../components/OpsAdminLayout';

import { requireOpsAdmin } from '../lib/auth';

type SupportTicketWithVendor = {
  id: string;
  vendorId: string;
  subject: string;
  message: string;
  status: string;
  submittedBy: string | null;
  createdAt: string;
  updatedAt: string;
  opsReply: string | null;
  opsRepliedAt: string | null;
  vendorName?: string;
  vendorSlug?: string;
};

type Props = {
  userEmail: string;
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const authResult = await requireOpsAdmin(context);
  if (!authResult.authorized) {
    if (authResult.redirect) {
      return { redirect: authResult.redirect };
    }
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }

  return {
    props: {
      userEmail: authResult.userEmail
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

export default function SupportPage({ userEmail }: Props) {
  const [tickets, setTickets] = useState<SupportTicketWithVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTicket, setDetailTicket] = useState<SupportTicketWithVendor | null>(null);
  const [detailStatus, setDetailStatus] = useState<string>('open');
  const [detailReply, setDetailReply] = useState<string>('');
  const [updating, setUpdating] = useState(false);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/support-tickets?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load tickets');
      if (data.success) setTickets(data.tickets);
      else setTickets([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  const fetchDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/support-tickets/${id}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) return;
      setDetailTicket(data.ticket);
      setDetailStatus(data.ticket.status);
      setDetailReply(data.ticket.opsReply ?? '');
    } catch {
      setDetailTicket(null);
    }
  };

  const openDetail = (id: string) => {
    setSelectedId(id);
    fetchDetail(id);
  };

  const handleUpdate = async () => {
    if (!selectedId) return;
    setUpdating(true);
    try {
      const body: { status?: string; opsReply?: string } = {};
      if (detailStatus !== detailTicket?.status) body.status = detailStatus;
      if (detailReply !== (detailTicket?.opsReply ?? '')) body.opsReply = detailReply;
      if (Object.keys(body).length === 0) {
        setUpdating(false);
        return;
      }
      const res = await fetch(`/api/support-tickets/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update');
      if (data.success) {
        fetchDetail(selectedId);
        fetchTickets();
      } else throw new Error(data.error);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update ticket');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <Head>
        <title>Support Inbox – CountrTop Ops</title>
      </Head>
      <OpsAdminLayout userEmail={userEmail}>
        <main className="page">
          <header className="page-header">
            <h1>Support Inbox</h1>
          </header>
          <div className="page-content">
            <h2 className="tickets-subheading">Support tickets (from vendors)</h2>

            <div className="tickets-toolbar">
              <select
                className="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="closed">Closed</option>
              </select>
              <button type="button" className="btn-refresh" onClick={fetchTickets} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {error && (
              <div className="error-banner">
                <p>{error}</p>
                <button type="button" onClick={fetchTickets} className="btn-retry">Retry</button>
              </div>
            )}

            {loading && tickets.length === 0 ? (
              <p className="tickets-empty">Loading tickets…</p>
            ) : tickets.length === 0 ? (
              <p className="tickets-empty">No tickets yet. Vendors can submit tickets from their admin Support page.</p>
            ) : (
              <div className="tickets-layout">
                <div className="tickets-list-wrap">
                  <table className="tickets-table">
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((t) => (
                        <tr
                          key={t.id}
                          className={selectedId === t.id ? 'selected' : ''}
                          onClick={() => openDetail(t.id)}
                        >
                          <td>{t.vendorName ?? '—'}</td>
                          <td className="subject-cell">{t.subject}</td>
                          <td>
                            <span className={`status-badge status-${t.status}`}>{t.status.replace('_', ' ')}</span>
                          </td>
                          <td className="date-cell">{formatDate(t.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedId && detailTicket && (
                  <div className="ticket-detail-panel">
                    <h3 className="detail-title">{detailTicket.subject}</h3>
                    <p className="detail-vendor">
                      {detailTicket.vendorName}
                      {detailTicket.vendorSlug && (
                        <a
                          href={`https://admin.countrtop.com/vendors/${detailTicket.vendorSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="detail-vendor-link"
                        >
                          View admin
                        </a>
                      )}
                    </p>
                    <div className="detail-message">
                      <strong>Message</strong>
                      <p>{detailTicket.message}</p>
                    </div>
                    {detailTicket.opsReply && (
                      <div className="detail-reply-existing">
                        <strong>Your reply</strong>
                        <p>{detailTicket.opsReply}</p>
                        {detailTicket.opsRepliedAt && (
                          <span className="detail-reply-date">{formatDate(detailTicket.opsRepliedAt)}</span>
                        )}
                      </div>
                    )}
                    <div className="detail-form">
                      <label>
                        Status
                        <select
                          value={detailStatus}
                          onChange={(e) => setDetailStatus(e.target.value)}
                          className="detail-select"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In progress</option>
                          <option value="closed">Closed</option>
                        </select>
                      </label>
                      <label>
                        Reply
                        <textarea
                          className="detail-textarea"
                          rows={4}
                          value={detailReply}
                          onChange={(e) => setDetailReply(e.target.value)}
                          placeholder="Type your reply to the vendor…"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-update"
                        onClick={handleUpdate}
                        disabled={updating}
                      >
                        {updating ? 'Updating…' : 'Update'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <style jsx global>{`
          .page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
          }

          .page-header {
            padding: 32px 48px;
            border-bottom: 1px solid var(--color-border);
          }

          .page-header h1 {
            font-size: 32px;
            font-weight: 700;
            margin: 0;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .page-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 48px;
          }

          .tickets-subheading {
            font-size: 18px;
            font-weight: 600;
            margin: 0 0 16px;
            color: var(--color-text);
          }

          .tickets-toolbar {
            display: flex;
            gap: 12px;
            align-items: center;
            margin-bottom: 24px;
          }

          .status-filter {
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--color-text);
            font-size: 14px;
            font-family: inherit;
          }

          .btn-refresh {
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--color-bg-warm);
            color: var(--color-text);
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            font-family: inherit;
          }

          .btn-refresh:hover:not(:disabled) {
            background: rgba(232, 93, 4, 0.12);
          }

          .btn-refresh:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .tickets-empty {
            font-size: 14px;
            color: var(--color-text-muted);
            margin: 0;
          }

          .error-banner {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .error-banner p {
            margin: 0;
            color: #fca5a5;
          }

          .btn-retry {
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid rgba(239, 68, 68, 0.3);
            background: rgba(239, 68, 68, 0.1);
            color: #fca5a5;
            font-size: 14px;
            cursor: pointer;
            font-family: inherit;
          }

          .tickets-layout {
            display: grid;
            grid-template-columns: 1fr 400px;
            gap: 24px;
          }

          .tickets-list-wrap {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            overflow: hidden;
          }

          .tickets-table {
            width: 100%;
            border-collapse: collapse;
          }

          .tickets-table thead {
            background: var(--color-bg-warm);
          }

          .tickets-table th {
            padding: 12px 16px;
            text-align: left;
            font-size: 12px;
            font-weight: 600;
            color: var(--color-text-muted);
            text-transform: uppercase;
          }

          .tickets-table td {
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            font-size: 14px;
            cursor: pointer;
          }

          .tickets-table tbody tr:hover {
            background: var(--color-bg-warm);
          }

          .tickets-table tbody tr.selected {
            background: rgba(232, 93, 4, 0.12);
          }

          .subject-cell {
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .date-cell {
            color: var(--color-text-muted);
            font-size: 13px;
          }

          .status-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            text-transform: capitalize;
          }

          .status-open {
            background: rgba(59, 130, 246, 0.15);
            color: #60a5fa;
          }

          .status-in_progress {
            background: rgba(245, 158, 11, 0.15);
            color: #fbbf24;
          }

          .status-closed {
            background: rgba(34, 197, 94, 0.15);
            color: #86efac;
          }

          .ticket-detail-panel {
            background: var(--ct-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 16px;
            padding: 24px;
            align-self: start;
          }

          .detail-title {
            margin: 0 0 8px;
            font-size: 18px;
            font-weight: 700;
          }

          .detail-vendor {
            margin: 0 0 16px;
            font-size: 14px;
            color: var(--color-text-muted);
          }

          .detail-vendor-link {
            margin-left: 8px;
            color: var(--color-primary);
          }

          .detail-message,
          .detail-reply-existing {
            margin-bottom: 16px;
          }

          .detail-message strong,
          .detail-reply-existing strong {
            display: block;
            margin-bottom: 6px;
            font-size: 12px;
            color: var(--color-text-muted);
          }

          .detail-message p,
          .detail-reply-existing p {
            margin: 0;
            white-space: pre-wrap;
            font-size: 14px;
          }

          .detail-reply-date {
            font-size: 12px;
            color: var(--color-text-muted);
          }

          .detail-form label {
            display: block;
            margin-bottom: 12px;
            font-size: 14px;
            font-weight: 600;
          }

          .detail-select {
            display: block;
            margin-top: 4px;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-primary);
            color: var(--color-text);
            font-size: 14px;
            font-family: inherit;
            width: 100%;
          }

          .detail-textarea {
            display: block;
            margin-top: 4px;
            width: 100%;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-primary);
            color: var(--color-text);
            font-size: 14px;
            font-family: inherit;
            box-sizing: border-box;
            resize: vertical;
          }

          .btn-update {
            margin-top: 12px;
            padding: 10px 20px;
            border-radius: 8px;
            border: none;
            background: var(--ct-gradient-primary);
            color: #fff;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            font-family: inherit;
          }

          .btn-update:hover:not(:disabled) {
            opacity: 0.9;
          }

          .btn-update:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          @media (max-width: 900px) {
            .tickets-layout {
              grid-template-columns: 1fr;
            }
          }
          `}</style>
        </main>
      </OpsAdminLayout>
    </>
  );
}
