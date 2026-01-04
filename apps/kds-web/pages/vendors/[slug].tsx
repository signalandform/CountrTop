import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback, useRef } from 'react';

import { getBrowserSupabaseClient } from '../../lib/supabaseBrowser';
import { requireVendorAdmin } from '../../lib/auth';
import {
  isOnline,
  saveTicketsToCache,
  loadTicketsFromCache,
  queueOfflineAction,
  syncOfflineQueue,
  applyOptimisticUpdateToCache,
  getOfflineQueue,
  type Ticket,
  type OfflineAction
} from '../../lib/offline';
import { createTicketsSubscription, type TicketChangeEvent } from '../../lib/realtime';

// Ticket type is now imported from offline.ts

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
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [queuedActionsCount, setQueuedActionsCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [useRealtime, setUseRealtime] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'UNKNOWN'>('UNKNOWN');
  const realtimeErrorCountRef = useRef(0);
  const MAX_REALTIME_ERRORS = 3;

  const fetchTickets = async (useCache = false) => {
    try {
      setLoading(true);
      setError(null);

      // Try to load from cache first if offline or if explicitly requested
      if (useCache || !isOnline()) {
        const cached = loadTicketsFromCache(vendorSlug);
        if (cached && cached.length > 0) {
          setTickets(cached);
          setLoading(false);
          // Still try to fetch in background if online
          if (isOnline()) {
            fetchTickets(false).catch(() => {
              // Silent fail - we have cache
            });
          }
          return;
        }
      }

      // Fetch from server
      const response = await fetch(`/api/vendors/${vendorSlug}/tickets`);
      const data: TicketsResponse = await response.json();
      if (data.ok) {
        setTickets(data.tickets);
        // Save locationId from response
        setLocationId(data.locationId);
        // Save to cache
        saveTicketsToCache(vendorSlug, data.tickets);
      } else {
        setError(data.error);
        // Fall back to cache if available
        const cached = loadTicketsFromCache(vendorSlug);
        if (cached) {
          setTickets(cached);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
      // Fall back to cache if available
      const cached = loadTicketsFromCache(vendorSlug);
      if (cached) {
        setTickets(cached);
      }
    } finally {
      setLoading(false);
    }
  };

  // Sync offline queue when coming back online
  const syncQueue = useCallback(async () => {
    if (!isOnline() || syncing) return;

    const queue = getOfflineQueue(vendorSlug);
    if (queue.length === 0) return;

    setSyncing(true);
    try {
      await syncOfflineQueue(vendorSlug, async (action: OfflineAction) => {
        try {
          const response = await fetch(`/api/vendors/${vendorSlug}/tickets/${action.ticketId}/status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: action.newStatus })
          });

          const data = await response.json();
          return data.ok === true;
        } catch (err) {
          console.error(`Failed to sync action ${action.id}:`, err);
          return false;
        }
      });

      // Refresh tickets after sync
      await fetchTickets();
    } catch (err) {
      console.error('Failed to sync queue:', err);
    } finally {
      setSyncing(false);
      // Update queued actions count
      setQueuedActionsCount(getOfflineQueue(vendorSlug).length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorSlug, syncing]);

  // Online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Sync queue when coming back online
      syncQueue();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    // Check initial state
    setIsOffline(!isOnline());

    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncQueue]);

  // Handle realtime events
  // Refetch all tickets to ensure we have full data (including order details)
  const handleRealtimeInsert = useCallback(async () => {
    // Refetch all tickets to get full data with order details
    await fetchTickets();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRealtimeUpdate = useCallback(async () => {
    // Refetch all tickets to get full data with order details
    await fetchTickets();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRealtimeDelete = useCallback(async (event: TicketChangeEvent) => {
    // Remove ticket from state immediately (optimistic update)
    setTickets(prev => {
      const filtered = prev.filter(t => t.ticket.id !== event.ticketId);
      // Update cache
      saveTicketsToCache(vendorSlug, filtered);
      return filtered;
    });
  }, [vendorSlug]);

  // Realtime subscription
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase || !locationId || !useRealtime || !isOnline()) {
      return;
    }

    let unsubscribe: (() => void) | null = null;

    const setupSubscription = () => {
      unsubscribe = createTicketsSubscription(
        supabase,
        locationId,
        {
          onInsert: () => handleRealtimeInsert(),
          onUpdate: () => handleRealtimeUpdate(),
          onDelete: handleRealtimeDelete,
          onError: (err) => {
            console.error('Realtime subscription error:', err);
            realtimeErrorCountRef.current += 1;
            if (realtimeErrorCountRef.current >= MAX_REALTIME_ERRORS) {
              setUseRealtime(false);
            }
            setRealtimeStatus('CHANNEL_ERROR');
          },
          onStatusChange: (status) => {
            setRealtimeStatus(status);
            if (status === 'SUBSCRIBED') {
              realtimeErrorCountRef.current = 0; // Reset error count on successful subscription
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              realtimeErrorCountRef.current += 1;
              if (realtimeErrorCountRef.current >= MAX_REALTIME_ERRORS) {
                setUseRealtime(false);
              }
            }
          },
        }
      );
    };

    setupSubscription();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [locationId, useRealtime, isOffline, handleRealtimeInsert, handleRealtimeUpdate, handleRealtimeDelete]);

  // Initial load and fallback polling
  useEffect(() => {
    // Load from cache first for instant display
    const cached = loadTicketsFromCache(vendorSlug);
    if (cached && cached.length > 0) {
      setTickets(cached);
      setLoading(false);
    }

    // Then fetch from server
    fetchTickets();

    // Update queued actions count
    setQueuedActionsCount(getOfflineQueue(vendorSlug).length);

    // Fallback polling (only if realtime is disabled or offline)
    // Use longer interval (60s) since realtime is primary
    const interval = setInterval(() => {
      if ((!useRealtime || !isOnline()) && isOnline()) {
        fetchTickets();
      }
      // Update queued actions count
      setQueuedActionsCount(getOfflineQueue(vendorSlug).length);
    }, 60000); // 60 seconds (longer than original 30s since realtime is primary)

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorSlug, useRealtime]);

  const handleBumpStatus = async (ticketId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'placed' || currentStatus === 'preparing' ? 'ready' : 'completed';
    
    setUpdatingTicketId(ticketId);

    // Apply optimistic update immediately
    applyOptimisticUpdateToCache(vendorSlug, ticketId, newStatus);
    if (newStatus === 'completed') {
      setTickets(prev => prev.filter(t => t.ticket.id !== ticketId));
    } else {
      setTickets(prev => prev.map(t => {
        if (t.ticket.id === ticketId) {
          return {
            ...t,
            ticket: {
              ...t.ticket,
              status: 'ready' as const,
              readyAt: new Date().toISOString()
            }
          };
        }
        return t;
      }));
    }

    // If offline, queue the action
    if (!isOnline()) {
      queueOfflineAction(vendorSlug, ticketId, newStatus);
      setQueuedActionsCount(getOfflineQueue(vendorSlug).length);
      setUpdatingTicketId(null);
      return;
    }

    // If online, try to sync immediately
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
        // Refetch to ensure consistency
        await fetchTickets();
      } else {
        // If server rejects, queue for retry
        queueOfflineAction(vendorSlug, ticketId, newStatus);
        setQueuedActionsCount(getOfflineQueue(vendorSlug).length);
        setError(data.error || 'Failed to update ticket status. Queued for retry.');
      }
    } catch (err) {
      // Network error - queue for retry
      queueOfflineAction(vendorSlug, ticketId, newStatus);
      setQueuedActionsCount(getOfflineQueue(vendorSlug).length);
      setError('Network error. Action queued for sync when online.');
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
              {isOffline && (
                <div className="offline-indicator">
                  <span className="offline-dot">●</span>
                  <span>Offline Mode</span>
                  {queuedActionsCount > 0 && (
                    <span className="queue-badge">{queuedActionsCount} queued</span>
                  )}
                </div>
              )}
              {!isOffline && useRealtime && realtimeStatus === 'SUBSCRIBED' && (
                <div className="realtime-indicator">
                  <span className="realtime-dot">●</span>
                  <span>Realtime</span>
                </div>
              )}
              {!isOffline && (!useRealtime || realtimeStatus !== 'SUBSCRIBED') && (
                <div className="polling-indicator">
                  <span className="polling-dot">●</span>
                  <span>Polling</span>
                </div>
              )}
              {syncing && (
                <div className="syncing-indicator">
                  <span>Syncing...</span>
                </div>
              )}
            </div>
            <div className="header-actions">
              <button 
                onClick={() => fetchTickets()} 
                className="refresh-button" 
                disabled={loading || syncing}
              >
                {loading ? 'Loading...' : syncing ? 'Syncing...' : 'Refresh'}
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
                    {ticket.shortcode && (
                      <div className="ticket-shortcode">
                        {ticket.shortcode}
                      </div>
                    )}
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

          .offline-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            padding: 6px 12px;
            background: rgba(255, 159, 10, 0.15);
            border: 1px solid rgba(255, 159, 10, 0.3);
            border-radius: 8px;
            font-size: 14px;
            color: #ff9f0a;
            font-weight: 500;
          }

          .offline-dot {
            font-size: 12px;
            animation: pulse 2s infinite;
          }

          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }

          .queue-badge {
            margin-left: 4px;
            padding: 2px 8px;
            background: rgba(255, 159, 10, 0.3);
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
          }

          .syncing-indicator {
            margin-top: 8px;
            padding: 6px 12px;
            background: rgba(52, 199, 89, 0.15);
            border: 1px solid rgba(52, 199, 89, 0.3);
            border-radius: 8px;
            font-size: 14px;
            color: #34c759;
            font-weight: 500;
          }

          .realtime-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            padding: 6px 12px;
            background: rgba(52, 199, 89, 0.15);
            border: 1px solid rgba(52, 199, 89, 0.3);
            border-radius: 8px;
            font-size: 14px;
            color: #34c759;
            font-weight: 500;
          }

          .realtime-dot {
            font-size: 12px;
            animation: pulse 2s infinite;
          }

          .polling-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            padding: 6px 12px;
            background: rgba(102, 126, 234, 0.15);
            border: 1px solid rgba(102, 126, 234, 0.3);
            border-radius: 8px;
            font-size: 14px;
            color: #667eea;
            font-weight: 500;
          }

          .polling-dot {
            font-size: 12px;
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
            position: relative;
          }

          .ticket-shortcode {
            position: absolute;
            top: -20px;
            left: 24px;
            font-size: 48px;
            font-weight: 900;
            color: #fff;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
            line-height: 1;
            z-index: 1;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
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

