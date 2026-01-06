import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useState, useEffect, useCallback, useRef } from 'react';

import { getBrowserSupabaseClient } from '../../lib/supabaseBrowser';
import { requireKDSSession } from '../../lib/auth';
import { getServerDataClient } from '../../lib/dataClient';
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
  locationId: string;
  themePreference?: 'light' | 'dark' | null;
};

export const getServerSideProps: GetServerSideProps<VendorPageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const locationIdParam = context.query.locationId as string | undefined;

  // Check KDS session
  const authResult = await requireKDSSession(context, slug ?? null, locationIdParam ?? null);
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

  // Use locationId from session or query param
  const locationId = locationIdParam || authResult.session.locationId;

  // Fetch vendor to get theme preference
  const dataClient = getServerDataClient();
  const vendor = slug ? await dataClient.getVendorBySlug(slug) : null;

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      locationId,
      themePreference: vendor?.themePreference || 'dark'
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

const getAgeColor = (placedAt: string): 'green' | 'yellow' | 'red' => {
  const ageMins = Math.floor((Date.now() - new Date(placedAt).getTime()) / 60000);
  if (ageMins < 8) return 'green';
  if (ageMins < 12) return 'yellow';
  return 'red';
};

const renderLineItems = (lineItems: unknown[] | null | undefined) => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return <div className="line-items-empty">No items</div>;
  }
  return (
    <div className="line-items-list">
      {lineItems.map((item, idx) => {
        const itemObj = item as Record<string, unknown> | null;
        const name = (itemObj?.name as string) || 'Item';
        const qty = (itemObj?.quantity as number) || 1;
        return (
          <div key={idx} className="line-item">
            <span className="quantity">{qty}×</span>
            <span className="name">{name}</span>
          </div>
        );
      })}
    </div>
  );
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

export default function VendorQueuePage({ vendorSlug, locationId: initialLocationId, themePreference = 'dark' }: VendorPageProps) {
  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themePreference);
  }, [themePreference]);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [queuedActionsCount, setQueuedActionsCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [locationId] = useState<string>(initialLocationId);
  const [useRealtime, setUseRealtime] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'UNKNOWN'>('UNKNOWN');
  const realtimeErrorCountRef = useRef(0);
  const [dailyAvgPrepTime, setDailyAvgPrepTime] = useState<number | null>(null);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [completedTickets, setCompletedTickets] = useState<Ticket[]>([]);
  const [loadingCompletedTickets, setLoadingCompletedTickets] = useState(false);
  const [recallingTicketId, setRecallingTicketId] = useState<string | null>(null);

  // Fetch daily average prep time
  useEffect(() => {
    const fetchDailyAvg = async () => {
      if (!locationId) return;
      try {
        const response = await fetch(`/api/vendors/${vendorSlug}/tickets/stats?locationId=${locationId}`);
        const data = await response.json();
        if (data.ok && data.data) {
          setDailyAvgPrepTime(data.data.avgPrepTimeMinutes);
        }
      } catch (err) {
        // Silent fail - not critical
        console.error('Failed to fetch daily average:', err);
      }
    };
    fetchDailyAvg();
    // Refresh every 5 minutes
    const interval = setInterval(fetchDailyAvg, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [vendorSlug, locationId]);

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
      const url = `/api/vendors/${vendorSlug}/tickets${locationId ? `?locationId=${locationId}` : ''}`;
      const response = await fetch(url);
      const data: TicketsResponse = await response.json();
      if (data.ok) {
        setTickets(data.tickets);
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
          const response = await fetch(`/api/vendors/${vendorSlug}/tickets/${action.ticketId}/status${locationId ? `?locationId=${locationId}` : ''}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include',
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
            // Only log the first error to reduce console noise
            if (realtimeErrorCountRef.current === 0) {
              console.warn('Realtime subscription error (will fallback to polling):', err.message);
            }
            realtimeErrorCountRef.current += 1;
            // Disable realtime after first error and fallback to polling
            if (realtimeErrorCountRef.current >= 1) {
              setUseRealtime(false);
              setRealtimeStatus('CHANNEL_ERROR');
            }
          },
          onStatusChange: (status) => {
            setRealtimeStatus(status);
            if (status === 'SUBSCRIBED') {
              realtimeErrorCountRef.current = 0; // Reset error count on successful subscription
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              // Only log the first status change error
              if (realtimeErrorCountRef.current === 0) {
                console.warn(`Realtime subscription ${status} (falling back to polling)`);
              }
              realtimeErrorCountRef.current += 1;
              // Disable realtime after first error and fallback to polling
              if (realtimeErrorCountRef.current >= 1) {
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

  const handleRecallClick = async () => {
    setShowRecallModal(true);
    setLoadingCompletedTickets(true);
    try {
      const url = `/api/vendors/${vendorSlug}/tickets/completed${locationId ? `?locationId=${locationId}` : ''}`;
      const response = await fetch(url, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.ok) {
        setCompletedTickets(data.tickets);
      } else {
        setError(data.error || 'Failed to load completed tickets');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load completed tickets');
    } finally {
      setLoadingCompletedTickets(false);
    }
  };

  const handleRecallTicket = async (ticketId: string) => {
    setRecallingTicketId(ticketId);
    try {
      const url = `/api/vendors/${vendorSlug}/tickets/${ticketId}/recall${locationId ? `?locationId=${locationId}` : ''}`;
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.ok) {
        // Close modal and refresh tickets
        setShowRecallModal(false);
        setCompletedTickets([]);
        await fetchTickets();
      } else {
        setError(data.error || 'Failed to recall ticket');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recall ticket');
    } finally {
      setRecallingTicketId(null);
    }
  };

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
      const response = await fetch(`/api/vendors/${vendorSlug}/tickets/${ticketId}/status${locationId ? `?locationId=${locationId}` : ''}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
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

  const handleSettings = () => {
    // Placeholder: Open settings modal or navigate to settings page
    alert('Settings - Coming soon');
  };

  const handleTimeClock = () => {
    // Placeholder: Open time clock modal or navigate to time clock page
    alert('Time Clock - Coming soon');
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
              {dailyAvgPrepTime !== null && (
                <p className="daily-avg">
                  Daily Avg: {dailyAvgPrepTime.toFixed(1)} min
                </p>
              )}
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
              <button onClick={handleRecallClick} className="recall-button-header">
                Recall
              </button>
              <button onClick={handleSettings} className="settings-button">
                Settings
              </button>
              <button onClick={handleTimeClock} className="time-clock-button">
                Time Clock
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
                const ageColor = getAgeColor(ticket.placedAt);
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
                      {renderLineItems(order.lineItems)}
                    </div>
                    <div className="ticket-right">
                      <div className={`age-timer age-timer-${ageColor}`}>{age}</div>
                      <div className="ticket-actions">
                        <button
                          className={`action-button ${ticket.status === 'ready' ? 'complete-button' : 'ready-button'}`}
                          onClick={() => handleBumpStatus(ticket.id, ticket.status)}
                          disabled={isUpdating}
                        >
                          {isUpdating ? '...' : actionLabel}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recall Modal */}
        {showRecallModal && (
          <div className="modal-overlay" onClick={() => setShowRecallModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Recall Completed Ticket</h2>
                <button className="modal-close" onClick={() => setShowRecallModal(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                {loadingCompletedTickets ? (
                  <div className="loading-state">
                    <div className="spinner">⏳</div>
                    <p>Loading completed tickets...</p>
                  </div>
                ) : completedTickets.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <h3>No Completed Tickets</h3>
                    <p>No completed tickets found in the last 24 hours.</p>
                  </div>
                ) : (
                  <div className="completed-tickets-list">
                    {completedTickets.map(({ ticket, order }) => {
                      const pickupLabel = getPickupLabel(ticket, order);
                      const sourceBadge = ticket.source === 'countrtop_online' ? 'Online' : 'POS';
                      const completedTime = ticket.completedAt 
                        ? new Date(ticket.completedAt).toLocaleTimeString()
                        : 'Unknown';
                      
                      return (
                        <div key={ticket.id} className="completed-ticket-item">
                          <div className="completed-ticket-info">
                            <div className="completed-ticket-header">
                              <span className="completed-ticket-label">{pickupLabel}</span>
                              <span className="completed-ticket-source" data-source={ticket.source}>
                                {sourceBadge}
                              </span>
                              {ticket.shortcode && (
                                <span className="completed-ticket-shortcode">{ticket.shortcode}</span>
                              )}
                            </div>
                            <div className="completed-ticket-details">
                              {renderLineItems(order.lineItems)}
                            </div>
                            <div className="completed-ticket-time">
                              Completed: {completedTime}
                            </div>
                          </div>
                          <button
                            className="recall-ticket-button"
                            onClick={() => handleRecallTicket(ticket.id)}
                            disabled={recallingTicketId === ticket.id}
                          >
                            {recallingTicketId === ticket.id ? 'Recalling...' : 'Recall'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <style jsx>{`
          :root {
            --bg-primary: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            --text-primary: #e8e8e8;
            --text-muted: #888;
            --glass-bg: rgba(255, 255, 255, 0.05);
            --glass-border: rgba(255, 255, 255, 0.1);
          }

          [data-theme="light"] {
            --bg-primary: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);
            --text-primary: #1e293b;
            --text-muted: #64748b;
            --glass-bg: rgba(255, 255, 255, 0.8);
            --glass-border: rgba(0, 0, 0, 0.1);
          }

          .page {
            min-height: 100vh;
            background: var(--bg-primary);
            color: var(--text-primary);
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
            color: var(--text-muted);
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

          .header-actions {
            display: flex;
            gap: 12px;
            align-items: center;
          }

          .settings-button,
          .time-clock-button {
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

          .settings-button:hover,
          .time-clock-button:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.3);
          }

          .daily-avg {
            font-size: 14px;
            color: #a78bfa;
            margin: 4px 0 0 0;
            font-weight: 500;
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
            color: var(--text-muted);
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

          .line-items-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .line-item {
            display: flex;
            gap: 8px;
            font-size: 14px;
            color: #e8e8e8;
          }

          .line-item .quantity {
            font-weight: 600;
            color: #a78bfa;
            min-width: 32px;
          }

          .line-item .name {
            color: #e8e8e8;
          }

          .line-items-empty {
            font-size: 14px;
            color: var(--text-muted);
          }

          .ticket-right {
            flex: 0 0 auto;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 12px;
          }

          .ticket-actions {
            display: flex;
            gap: 8px;
            align-items: center;
          }

          .recall-button-header {
            padding: 10px 20px;
            border-radius: 8px;
            border: 1px solid rgba(167, 139, 250, 0.3);
            background: rgba(167, 139, 250, 0.1);
            color: #a78bfa;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
          }

          .recall-button-header:hover {
            background: rgba(167, 139, 250, 0.2);
            border-color: rgba(167, 139, 250, 0.5);
          }

          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 24px;
          }

          .modal-content {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            max-width: 800px;
            width: 100%;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .modal-header h2 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            color: #e8e8e8;
          }

          .modal-close {
            background: none;
            border: none;
            color: var(--text-muted);
            font-size: 32px;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s;
          }

          .modal-close:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #e8e8e8;
          }

          .modal-body {
            padding: 24px;
            overflow-y: auto;
            flex: 1;
          }

          .completed-tickets-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .completed-ticket-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.03);
            transition: all 0.2s;
          }

          .completed-ticket-item:hover {
            background: rgba(255, 255, 255, 0.05);
            border-color: rgba(255, 255, 255, 0.15);
          }

          .completed-ticket-info {
            flex: 1;
            min-width: 0;
          }

          .completed-ticket-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
          }

          .completed-ticket-label {
            font-size: 16px;
            font-weight: 600;
            color: #e8e8e8;
          }

          .completed-ticket-source {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .completed-ticket-source[data-source='countrtop_online'] {
            background: rgba(52, 199, 89, 0.2);
            color: #34c759;
            border: 1px solid rgba(52, 199, 89, 0.3);
          }

          .completed-ticket-source[data-source='square_pos'] {
            background: rgba(255, 159, 10, 0.2);
            color: #ff9f0a;
            border: 1px solid rgba(255, 159, 10, 0.3);
          }

          .completed-ticket-shortcode {
            font-size: 14px;
            font-weight: 700;
            color: #a78bfa;
            background: rgba(167, 139, 250, 0.1);
            padding: 4px 8px;
            border-radius: 4px;
          }

          .completed-ticket-details {
            margin-bottom: 8px;
          }

          .completed-ticket-time {
            font-size: 12px;
            color: var(--text-muted);
          }

          .recall-ticket-button {
            padding: 10px 20px;
            border-radius: 8px;
            border: 1px solid rgba(167, 139, 250, 0.3);
            background: rgba(167, 139, 250, 0.1);
            color: #a78bfa;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
            white-space: nowrap;
          }

          .recall-ticket-button:hover:not(:disabled) {
            background: rgba(167, 139, 250, 0.2);
            border-color: rgba(167, 139, 250, 0.5);
          }

          .recall-ticket-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
            border-color: #a78bfa;
            transform: translateY(-1px);
          }

          .age-timer {
            font-size: 18px;
            font-weight: 700;
            padding: 8px 12px;
            border-radius: 8px;
            text-align: center;
            min-width: 60px;
          }

          .age-timer-green {
            color: #34c759;
            background: rgba(52, 199, 89, 0.1);
          }

          .age-timer-yellow {
            color: #ff9f0a;
            background: rgba(255, 159, 10, 0.1);
          }

          .age-timer-red {
            color: #ff3b30;
            background: rgba(255, 59, 48, 0.1);
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

