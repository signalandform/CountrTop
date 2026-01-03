import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

import { getBrowserSupabaseClient } from '../../lib/supabaseBrowser';
import { requireVendorAdmin } from '../../lib/auth';

type Ticket = {
  ticket: {
    id: string;
    squareOrderId: string;
    locationId: string;
    ctReferenceId?: string | null;
    customerUserId?: string | null;
    source: 'countrtop_online' | 'square_pos';
    status: 'placed' | 'preparing' | 'ready';
    placedAt: string;
    readyAt?: string | null;
    completedAt?: string | null;
    updatedAt: string;
  };
  order: {
    squareOrderId: string;
    locationId: string;
    state: string;
    createdAt: string;
    updatedAt: string;
    referenceId?: string | null;
    metadata?: Record<string, unknown> | null;
    lineItems?: unknown[] | null;
    source: 'countrtop_online' | 'square_pos';
  };
};

type TicketsResponse = {
  ok: true;
  locationId: string;
  tickets: Ticket[];
} | {
  ok: false;
  error: string;
};

type VendorPageProps = {
  vendorSlug: string;
};

export const getServerSideProps: GetServerSideProps<VendorPageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  // Check vendor admin access
  const authResult = await requireVendorAdmin(context, slug ?? null);
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
      vendorSlug: slug ?? 'unknown'
    }
  };
};

const formatAge = (placedAt: string): string => {
  const now = new Date();
  const placed = new Date(placedAt);
  const diffMs = now.getTime() - placed.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  return `${hours}h`;
};

const getLineItemsSummary = (lineItems: unknown[] | null | undefined): string => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return 'No items';
  }
  const top3 = lineItems.slice(0, 3);
  const items = top3.map((item: unknown) => {
    const itemObj = item as Record<string, unknown> | null;
    const name = (itemObj?.name as string) || 'Item';
    const qty = (itemObj?.quantity as number) || 1;
    return qty > 1 ? `${name} (×${qty})` : name;
  });
  const summary = items.join(', ');
  if (lineItems.length > 3) {
    return `${summary} + ${lineItems.length - 3} more`;
  }
  return summary;
};

const getPickupLabel = (ticket: Ticket['ticket'], order: Ticket['order']): string => {
  // Check if it's a CountrTop order (has customer_user_id or ct_reference_id)
  if (ticket.customerUserId || ticket.ctReferenceId) {
    // Try to get customer name from metadata
    const metadata = order.metadata as Record<string, unknown> | null;
    if (metadata?.customer_display_name) {
      return String(metadata.customer_display_name);
    }
    if (metadata?.pickup_label) {
      return String(metadata.pickup_label);
    }
    // Fallback to order ID
    return `Order ${order.squareOrderId.slice(-6).toUpperCase()}`;
  }
  // POS order - use order ID
  return `Order ${order.squareOrderId.slice(-6).toUpperCase()}`;
};

export default function VendorQueuePage({ vendorSlug }: VendorPageProps) {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/vendors/${vendorSlug}/tickets`);
      const data: TicketsResponse = await response.json();
      if (data.ok) {
        setTickets(data.tickets);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    // Refresh every 30 seconds
    const interval = setInterval(fetchTickets, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorSlug]);

  const handleBumpStatus = async (ticketId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'placed' || currentStatus === 'preparing' ? 'ready' : 'completed';
    
    setUpdatingTicketId(ticketId);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/tickets/${ticketId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();
      if (data.ok) {
        // Optimistically update UI
        setTickets(prev => prev.filter(t => t.ticket.id !== ticketId));
        // Refetch to ensure consistency
        await fetchTickets();
      } else {
        setError(data.error || 'Failed to update ticket status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket status');
    } finally {
      setUpdatingTicketId(null);
    }
  };

  const handleSignOut = async () => {
    const supabase = getBrowserSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
      router.push('/login');
    }
  };

  return (
    <>
      <Head>
        <title>{vendorSlug} - CountrTop KDS</title>
      </Head>
      <main className="page">
        <div className="container">
          <header className="header">
            <div>
              <h1 className="title">CountrTop KDS</h1>
              <p className="vendor-slug">Vendor: {vendorSlug}</p>
            </div>
            <div className="header-actions">
              <button onClick={fetchTickets} className="refresh-button" disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <button onClick={handleSignOut} className="sign-out-button">
                Sign Out
              </button>
            </div>
          </header>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {loading && tickets.length === 0 ? (
            <div className="loading-state">
              <div className="spinner">⏳</div>
              <p>Loading queue...</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h2>No Active Orders</h2>
              <p>The queue is empty.</p>
            </div>
          ) : (
            <div className="tickets-list">
              {tickets.map(({ ticket, order }) => {
                const pickupLabel = getPickupLabel(ticket, order);
                const sourceBadge = ticket.source === 'countrtop_online' ? 'Online' : 'POS';
                const age = formatAge(ticket.placedAt);
                const lineItemsSummary = getLineItemsSummary(order.lineItems);
                const actionLabel = ticket.status === 'placed' || ticket.status === 'preparing' ? 'Mark Ready' : 'Complete';
                const isUpdating = updatingTicketId === ticket.id;

                return (
                  <div key={ticket.id} className="ticket-card">
                    <div className="ticket-left">
                      <div className="pickup-label">{pickupLabel}</div>
                      <div className="source-badge" data-source={ticket.source}>
                        {sourceBadge}
                      </div>
                    </div>
                    <div className="ticket-middle">
                      <div className="line-items">{lineItemsSummary}</div>
                    </div>
                    <div className="ticket-right">
                      <div className="age-timer">{age}</div>
                      <button
                        className={`action-button ${ticket.status === 'ready' ? 'complete-button' : 'ready-button'}`}
                        onClick={() => handleBumpStatus(ticket.id, ticket.status)}
                        disabled={isUpdating}
                      >
                        {isUpdating ? '...' : actionLabel}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 24px;
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 48px;
            padding-bottom: 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .title {
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .vendor-slug {
            font-size: 16px;
            color: #888;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .sign-out-button {
            padding: 12px 20px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
            font-family: inherit;
          }

          .sign-out-button:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          .header-actions {
            display: flex;
            gap: 12px;
            align-items: center;
          }

          .refresh-button {
            padding: 12px 20px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
            font-family: inherit;
          }

          .refresh-button:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.1);
          }

          .refresh-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .error-message {
            background: rgba(255, 59, 48, 0.2);
            border: 1px solid rgba(255, 59, 48, 0.4);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
            color: #ff6b6b;
          }

          .loading-state,
          .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 400px;
            text-align: center;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 20px;
            padding: 48px;
          }

          .spinner,
          .empty-icon {
            font-size: 64px;
            margin-bottom: 24px;
          }

          .loading-state h2,
          .empty-state h2 {
            font-size: 24px;
            font-weight: 700;
            margin: 0 0 12px;
            color: #e8e8e8;
          }

          .loading-state p,
          .empty-state p {
            font-size: 16px;
            color: #888;
            margin: 0;
          }

          .tickets-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .ticket-card {
            display: flex;
            align-items: center;
            gap: 24px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            transition: background 0.2s, border-color 0.2s;
          }

          .ticket-card:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
          }

          .ticket-left {
            flex: 0 0 180px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .pickup-label {
            font-size: 18px;
            font-weight: 600;
            color: #e8e8e8;
          }

          .source-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .source-badge[data-source='countrtop_online'] {
            background: rgba(52, 199, 89, 0.2);
            color: #34c759;
            border: 1px solid rgba(52, 199, 89, 0.3);
          }

          .source-badge[data-source='square_pos'] {
            background: rgba(255, 159, 10, 0.2);
            color: #ff9f0a;
            border: 1px solid rgba(255, 159, 10, 0.3);
          }

          .ticket-middle {
            flex: 1;
            min-width: 0;
          }

          .line-items {
            font-size: 16px;
            color: #ccc;
            line-height: 1.5;
          }

          .ticket-right {
            flex: 0 0 auto;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 12px;
          }

          .age-timer {
            font-size: 14px;
            color: #888;
            font-weight: 500;
          }

          .action-button {
            min-height: 48px;
            padding: 12px 24px;
            border-radius: 12px;
            border: none;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
            white-space: nowrap;
          }

          .ready-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }

          .ready-button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          }

          .complete-button {
            background: linear-gradient(135deg, #34c759 0%, #30d158 100%);
            color: white;
          }

          .complete-button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(52, 199, 89, 0.4);
          }

          .action-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
          }

          @media (max-width: 768px) {
            .ticket-card {
              flex-direction: column;
              align-items: flex-start;
            }

            .ticket-left,
            .ticket-middle,
            .ticket-right {
              flex: 1 1 100%;
              width: 100%;
            }

            .ticket-right {
              align-items: stretch;
            }

            .action-button {
              width: 100%;
            }
          }
        `}</style>
      </main>
    </>
  );
}

