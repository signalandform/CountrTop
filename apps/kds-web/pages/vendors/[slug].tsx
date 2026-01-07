import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';

import { getBrowserSupabaseClient } from '../../lib/supabaseBrowser';
import { requireKDSSession } from '../../lib/auth';
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
  vendorName: string;
  locationId: string;
  locationName: string;
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

  // Fetch vendor and location names
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  
  let vendorName = 'Kitchen';
  let locationName = 'Main';

  if (supabaseUrl && supabaseKey && slug) {
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase });
    
    const vendor = await dataClient.getVendorBySlug(slug);
    if (vendor) {
      vendorName = vendor.displayName;
      
      // Try to get location name from vendor_locations
      const { data: locationData } = await supabase
        .from('vendor_locations')
        .select('name')
        .eq('square_location_id', locationId)
        .maybeSingle();
      
      if (locationData) {
        locationName = locationData.name;
      }
    }
  }

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName,
      locationId,
      locationName
    }
  };
};

const formatAge = (placedAt: string, currentTime: number = Date.now()): string => {
  const placed = new Date(placedAt).getTime();
  const diffMs = currentTime - placed;
  
  // Always show MM:SS format
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const getAgeColor = (placedAt: string): 'green' | 'yellow' | 'red' => {
  const ageMins = Math.floor((Date.now() - new Date(placedAt).getTime()) / 60000);
  if (ageMins < 8) return 'green';
  if (ageMins < 12) return 'yellow';
  return 'red';
};

// Keywords that indicate allergy or special handling
const ALLERGY_KEYWORDS = ['allergy', 'allergic', 'no ', 'without', 'dairy-free', 'gluten-free', 'nut-free', 'vegan', 'vegetarian'];
const EXTRA_KEYWORDS = ['extra', 'double', 'add ', 'with '];

const isAllergyModifier = (modName: string): boolean => {
  const lower = modName.toLowerCase();
  return ALLERGY_KEYWORDS.some(kw => lower.includes(kw));
};

const isExtraModifier = (modName: string): boolean => {
  const lower = modName.toLowerCase();
  return EXTRA_KEYWORDS.some(kw => lower.includes(kw));
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
        const modifiers = (itemObj?.modifiers as Array<Record<string, unknown>>) || [];
        const note = (itemObj?.note as string) || '';
        
        return (
          <div key={idx} className="line-item">
            <div className="item-header">
              <span className="quantity">{qty}</span>
              <span className="name">{name}</span>
            </div>
            {modifiers.length > 0 && (
              <div className="modifiers-list">
                {modifiers.map((mod, modIdx) => {
                  const modName = (mod?.name as string) || '';
                  const isAllergy = isAllergyModifier(modName);
                  const isExtra = isExtraModifier(modName);
                  return (
                    <span 
                      key={modIdx} 
                      className={`modifier ${isAllergy ? 'modifier-allergy' : ''} ${isExtra ? 'modifier-extra' : ''}`}
                    >
                      {isAllergy && '⚠️ '}{modName}
                    </span>
                  );
                })}
              </div>
            )}
            {note && (
              <div className="item-note">
                📝 {note}
              </div>
            )}
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

export default function VendorQueuePage({ vendorSlug, vendorName, locationId: initialLocationId, locationName }: VendorPageProps) {
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
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showTimeClock, setShowTimeClock] = useState(false);
  const [timeClockPin, setTimeClockPin] = useState('');
  const [timeClockLoading, setTimeClockLoading] = useState(false);
  const [timeClockError, setTimeClockError] = useState<string | null>(null);
  const [timeClockSuccess, setTimeClockSuccess] = useState<string | null>(null);
  
  // Ticket menu state
  const [activeTicketMenu, setActiveTicketMenu] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelText, setLabelText] = useState('');

  // Update current time every second for live timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
    // Three-stage tap-to-start flow:
    // placed → preparing → ready → completed
    let newStatus: 'preparing' | 'ready' | 'completed';
    if (currentStatus === 'placed') {
      newStatus = 'preparing';
    } else if (currentStatus === 'preparing') {
      newStatus = 'ready';
    } else {
      newStatus = 'completed';
    }
    
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
              status: newStatus as 'preparing' | 'ready',
              ...(newStatus === 'ready' ? { readyAt: new Date().toISOString() } : {})
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

  // ============================================
  // Ticket Menu Actions
  // ============================================
  
  const handleTicketMenuToggle = (ticketId: string) => {
    setActiveTicketMenu(prev => prev === ticketId ? null : ticketId);
  };

  const handleHoldTicket = async (ticketId: string) => {
    setActiveTicketMenu(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/tickets/${ticketId}/hold${locationId ? `?locationId=${locationId}` : ''}`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.ok) {
        await fetchTickets();
      } else {
        setError(data.error || 'Failed to hold ticket');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to hold ticket');
    }
  };

  const handleUnholdTicket = async (ticketId: string) => {
    setActiveTicketMenu(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/tickets/${ticketId}/unhold${locationId ? `?locationId=${locationId}` : ''}`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.ok) {
        await fetchTickets();
      } else {
        setError(data.error || 'Failed to unhold ticket');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unhold ticket');
    }
  };

  const handleOpenNoteEditor = (ticketId: string, currentNote: string) => {
    setActiveTicketMenu(null);
    setEditingNote(ticketId);
    setNoteText(currentNote || '');
  };

  const handleSaveNote = async (ticketId: string) => {
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/tickets/${ticketId}/note${locationId ? `?locationId=${locationId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: noteText })
      });
      const data = await response.json();
      if (data.ok) {
        setEditingNote(null);
        setNoteText('');
        await fetchTickets();
      } else {
        setError(data.error || 'Failed to save note');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    }
  };

  const handleOpenLabelEditor = (ticketId: string, currentLabel: string) => {
    setActiveTicketMenu(null);
    setEditingLabel(ticketId);
    setLabelText(currentLabel || '');
  };

  const handleSaveLabel = async (ticketId: string) => {
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/tickets/${ticketId}/label${locationId ? `?locationId=${locationId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label: labelText })
      });
      const data = await response.json();
      if (data.ok) {
        setEditingLabel(null);
        setLabelText('');
        await fetchTickets();
      } else {
        setError(data.error || 'Failed to save label');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save label');
    }
  };

  const handleMoveTicket = async (ticketId: string, direction: 'up' | 'down') => {
    setActiveTicketMenu(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/tickets/${ticketId}/reorder${locationId ? `?locationId=${locationId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ direction })
      });
      const data = await response.json();
      if (data.ok) {
        await fetchTickets();
      } else {
        setError(data.error || 'Failed to reorder ticket');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder ticket');
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (activeTicketMenu) {
        setActiveTicketMenu(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeTicketMenu]);

  const handleSettings = () => {
    // Placeholder: Open settings modal or navigate to settings page
    alert('Settings - Coming soon');
  };

  const handleTimeClock = () => {
    setShowTimeClock(true);
    setTimeClockPin('');
    setTimeClockError(null);
    setTimeClockSuccess(null);
  };

  const handleTimeClockSubmit = async (action: 'clock-in' | 'clock-out') => {
    if (!timeClockPin || !/^\d{3}$/.test(timeClockPin)) {
      setTimeClockError('Please enter a valid 3-digit PIN');
      return;
    }

    setTimeClockLoading(true);
    setTimeClockError(null);
    setTimeClockSuccess(null);

    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/time-clock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          pin: timeClockPin,
          action
        })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to process time clock');
      }

      setTimeClockSuccess(`${data.data.employeeName} ${action === 'clock-in' ? 'clocked in' : 'clocked out'} successfully`);
      setTimeClockPin('');
      
      // Auto-close after 2 seconds
      setTimeout(() => {
        setShowTimeClock(false);
        setTimeClockSuccess(null);
      }, 2000);
    } catch (err) {
      setTimeClockError(err instanceof Error ? err.message : 'Failed to process time clock');
    } finally {
      setTimeClockLoading(false);
    }
  };

  const handleTimeClockPinInput = (value: string) => {
    // Only allow digits, max 3 characters
    const digitsOnly = value.replace(/\D/g, '').slice(0, 3);
    setTimeClockPin(digitsOnly);
    setTimeClockError(null);
  };

  return (
    <>
      <Head>
        <title>{vendorName} · {locationName} - KDS</title>
      </Head>
      <main className="page">
        <div className="container">
          <header className="header">
            <div>
              <h1 className="title">{vendorName}</h1>
              <p className="vendor-slug">📍 {locationName}</p>
              {dailyAvgPrepTime !== null && (
                <p className="daily-avg">
                  Avg Prep: {dailyAvgPrepTime.toFixed(1)} min
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
              <Link href={`/vendors/${vendorSlug}/analytics?locationId=${locationId}`} className="analytics-button">
                📊 Analytics
              </Link>
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
              {/* Separate held tickets */}
              {tickets.filter(t => t.ticket.heldAt).length > 0 && (
                <div className="held-section">
                  <div className="held-section-header">⏸️ On Hold</div>
                  {tickets.filter(t => t.ticket.heldAt).map(({ ticket, order, customer }) => {
                    const displayLabel = ticket.customLabel || (customer?.displayName) || getPickupLabel(ticket, order);
                    return (
                      <div key={ticket.id} className="ticket-card ticket-held">
                        <div className="ticket-left">
                          <div className="pickup-label">{displayLabel}</div>
                          <div className="held-badge">⏸️ Held</div>
                        </div>
                        <div className="ticket-middle">
                          {renderLineItems(order.lineItems)}
                          {ticket.staffNotes && (
                            <div className="staff-notes">📝 {ticket.staffNotes}</div>
                          )}
                        </div>
                        <div className="ticket-right">
                          <button 
                            className="action-button unhold-button"
                            onClick={() => handleUnholdTicket(ticket.id)}
                          >
                            Resume
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Active tickets */}
              {tickets.filter(t => !t.ticket.heldAt).map(({ ticket, order, customer }, index, activeTickets) => {
                const displayLabel = ticket.customLabel || (customer?.displayName) || getPickupLabel(ticket, order);
                const sourceBadge = ticket.source === 'countrtop_online' ? 'Online' : 'POS';
                const age = formatAge(ticket.placedAt, currentTime);
                const ageColor = getAgeColor(ticket.placedAt);
                
                // Three-stage tap-to-start flow labels
                let actionLabel: string;
                let buttonClass: string;
                if (ticket.status === 'placed') {
                  actionLabel = 'Start';
                  buttonClass = 'start-button';
                } else if (ticket.status === 'preparing') {
                  actionLabel = 'Ready';
                  buttonClass = 'ready-button';
                } else {
                  actionLabel = 'Complete';
                  buttonClass = 'complete-button';
                }
                
                const isUpdating = updatingTicketId === ticket.id;
                const isOnlineOrder = ticket.source === 'countrtop_online';
                const hasLoyalty = customer?.isLoyaltyMember;
                const isPreparing = ticket.status === 'preparing';
                const isMenuOpen = activeTicketMenu === ticket.id;
                const isFirst = index === 0;
                const isLast = index === activeTickets.length - 1;

                return (
                  <div key={ticket.id} className={`ticket-card ${isOnlineOrder ? 'ticket-online' : 'ticket-pos'} ${isPreparing ? 'ticket-preparing' : ''}`}>
                    {/* Menu button */}
                    <div className="ticket-menu-wrapper" onClick={(e) => e.stopPropagation()}>
                      <button 
                        className="ticket-menu-button"
                        onClick={() => handleTicketMenuToggle(ticket.id)}
                      >
                        ⋮
                      </button>
                      {isMenuOpen && (
                        <div className="ticket-menu-dropdown">
                          <button onClick={() => handleHoldTicket(ticket.id)}>
                            ⏸️ Hold
                          </button>
                          <button onClick={() => handleOpenNoteEditor(ticket.id, ticket.staffNotes || '')}>
                            📝 {ticket.staffNotes ? 'Edit Note' : 'Add Note'}
                          </button>
                          <button onClick={() => handleOpenLabelEditor(ticket.id, ticket.customLabel || '')}>
                            ✏️ Rename
                          </button>
                          <div className="menu-divider" />
                          <button 
                            onClick={() => handleMoveTicket(ticket.id, 'up')}
                            disabled={isFirst}
                          >
                            ⬆️ Move Up
                          </button>
                          <button 
                            onClick={() => handleMoveTicket(ticket.id, 'down')}
                            disabled={isLast}
                          >
                            ⬇️ Move Down
                          </button>
                        </div>
                      )}
                    </div>

                    {ticket.shortcode && (
                      <div className="ticket-shortcode">
                        {ticket.shortcode}
                      </div>
                    )}
                    <div className="ticket-left">
                      <div className="pickup-label">{displayLabel}</div>
                      <div className="badge-row">
                        <div className="source-badge" data-source={ticket.source}>
                          {sourceBadge}
                        </div>
                        {isPreparing && (
                          <div className="status-badge preparing">
                            🔥 Cooking
                          </div>
                        )}
                        {hasLoyalty && (
                          <div className="loyalty-badge" title={`${customer?.loyaltyPoints} loyalty points`}>
                            ⭐ {customer?.loyaltyPoints}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ticket-middle">
                      {renderLineItems(order.lineItems)}
                      {ticket.staffNotes && (
                        <div className="staff-notes">📝 {ticket.staffNotes}</div>
                      )}
                    </div>
                    <div className="ticket-right">
                      <div className={`age-timer age-timer-${ageColor}`}>{age}</div>
                      <div className="ticket-actions">
                        <button
                          className={`action-button ${buttonClass}`}
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

          {/* Note Editor Modal */}
            {editingNote && (
              <div className="modal-overlay" onClick={() => setEditingNote(null)}>
                <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2>Add Staff Note</h2>
                    <button className="modal-close" onClick={() => setEditingNote(null)}>×</button>
                  </div>
                  <div className="modal-body">
                    <textarea
                      className="note-input"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="e.g., Customer waiting in red car, Extra napkins requested..."
                      rows={3}
                      autoFocus
                    />
                    <div className="modal-actions">
                      <button className="btn-cancel" onClick={() => setEditingNote(null)}>Cancel</button>
                      <button className="btn-save" onClick={() => handleSaveNote(editingNote)}>Save Note</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Label Editor Modal */}
            {editingLabel && (
              <div className="modal-overlay" onClick={() => setEditingLabel(null)}>
                <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2>Rename Ticket</h2>
                    <button className="modal-close" onClick={() => setEditingLabel(null)}>×</button>
                  </div>
                  <div className="modal-body">
                    <input
                      type="text"
                      className="label-input"
                      value={labelText}
                      onChange={(e) => setLabelText(e.target.value)}
                      placeholder="e.g., Table 5, John's Order..."
                      autoFocus
                    />
                    <div className="modal-actions">
                      <button className="btn-cancel" onClick={() => setEditingLabel(null)}>Cancel</button>
                      <button className="btn-save" onClick={() => handleSaveLabel(editingLabel)}>Save</button>
                    </div>
                  </div>
                </div>
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

        {/* Time Clock Modal */}
        {showTimeClock && (
          <div className="modal-overlay" onClick={() => setShowTimeClock(false)}>
            <div className="modal-content time-clock-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Time Clock</h2>
                <button className="modal-close" onClick={() => setShowTimeClock(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="time-clock-pin-input">
                  <label htmlFor="time-clock-pin">Enter 3-Digit PIN</label>
                  <input
                    id="time-clock-pin"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{3}"
                    maxLength={3}
                    value={timeClockPin}
                    onChange={(e) => handleTimeClockPinInput(e.target.value)}
                    placeholder="000"
                    className="pin-input-large"
                    autoFocus
                    disabled={timeClockLoading}
                  />
                </div>

                {timeClockError && (
                  <div className="time-clock-error">
                    {timeClockError}
                  </div>
                )}

                {timeClockSuccess && (
                  <div className="time-clock-success">
                    {timeClockSuccess}
                  </div>
                )}

                <div className="time-clock-actions">
                  <button
                    className="time-clock-button clock-in-button"
                    onClick={() => handleTimeClockSubmit('clock-in')}
                    disabled={timeClockLoading || timeClockPin.length !== 3}
                  >
                    {timeClockLoading ? 'Processing...' : 'Clock In'}
                  </button>
                  <button
                    className="time-clock-button clock-out-button"
                    onClick={() => handleTimeClockSubmit('clock-out')}
                    disabled={timeClockLoading || timeClockPin.length !== 3}
                  >
                    {timeClockLoading ? 'Processing...' : 'Clock Out'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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

          .analytics-button {
            padding: 12px 20px;
            border-radius: 12px;
            border: 1px solid rgba(102, 126, 234, 0.4);
            background: rgba(102, 126, 234, 0.15);
            color: #a5b4fc;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
            font-family: inherit;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }

          .analytics-button:hover {
            background: rgba(102, 126, 234, 0.25);
            border-color: rgba(102, 126, 234, 0.6);
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

          .customer-name {
            font-size: 20px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 4px;
          }

          .badge-row {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
          }

          .loyalty-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 193, 7, 0.2) 100%);
            color: #ffc107;
            border: 1px solid rgba(255, 215, 0, 0.3);
          }

          .ticket-online {
            border-left: 4px solid #34c759;
          }

          .ticket-pos {
            border-left: 4px solid #ff9f0a;
          }

          .ticket-preparing {
            background: rgba(255, 159, 10, 0.08);
            border-color: rgba(255, 159, 10, 0.2);
          }

          .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
          }

          .status-badge.preparing {
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.2) 0%, rgba(255, 69, 58, 0.2) 100%);
            color: #ff9f0a;
            border: 1px solid rgba(255, 159, 10, 0.3);
            animation: cooking-pulse 1.5s ease-in-out infinite;
          }

          @keyframes cooking-pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.7;
            }
          }

          .ticket-middle {
            flex: 1;
            min-width: 0;
            font-size: 25px;
          }

          .line-items-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .line-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          }

          .line-item:last-child {
            border-bottom: none;
          }

          .item-header {
            display: flex;
            align-items: baseline;
            gap: 12px;
          }

          .line-item .quantity {
            font-size: 28px;
            font-weight: 700;
            color: #a78bfa;
            min-width: 36px;
            text-align: center;
          }

          .line-item .name {
            font-size: 22px;
            color: #e8e8e8;
            font-weight: 500;
          }

          /* Modifier highlighting */
          .modifiers-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-left: 48px;
          }

          .modifier {
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            background: rgba(255, 255, 255, 0.1);
            color: #c8c8c8;
          }

          .modifier-allergy {
            background: rgba(255, 59, 48, 0.25);
            color: #ff6b6b;
            border: 1px solid rgba(255, 59, 48, 0.4);
            font-weight: 600;
          }

          .modifier-extra {
            background: rgba(52, 199, 89, 0.2);
            color: #6ee7b7;
          }

          .item-note {
            margin-left: 48px;
            font-size: 14px;
            color: #ffd60a;
            font-style: italic;
          }

          .line-items-empty {
            font-size: 14px;
            color: #888;
          }

          /* Staff notes on ticket */
          .staff-notes {
            margin-top: 12px;
            padding: 8px 12px;
            background: rgba(255, 214, 10, 0.15);
            border: 1px solid rgba(255, 214, 10, 0.3);
            border-radius: 8px;
            font-size: 14px;
            color: #ffd60a;
          }

          /* Held tickets section */
          .held-section {
            margin-bottom: 24px;
            padding: 16px;
            background: rgba(255, 159, 10, 0.1);
            border: 1px solid rgba(255, 159, 10, 0.3);
            border-radius: 16px;
          }

          .held-section-header {
            font-size: 16px;
            font-weight: 600;
            color: #ff9f0a;
            margin-bottom: 12px;
          }

          .ticket-held {
            opacity: 0.8;
            background: rgba(255, 159, 10, 0.1) !important;
            border-color: rgba(255, 159, 10, 0.3) !important;
          }

          .held-badge {
            display: inline-block;
            padding: 4px 10px;
            background: rgba(255, 159, 10, 0.3);
            color: #ff9f0a;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
          }

          .unhold-button {
            background: linear-gradient(135deg, #ff9f0a 0%, #ff6b00 100%) !important;
          }

          /* Ticket menu */
          .ticket-menu-wrapper {
            position: absolute;
            top: 12px;
            right: 12px;
            z-index: 10;
          }

          .ticket-menu-button {
            width: 32px;
            height: 32px;
            border: none;
            background: rgba(255, 255, 255, 0.1);
            color: #888;
            font-size: 18px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          }

          .ticket-menu-button:hover {
            background: rgba(255, 255, 255, 0.2);
            color: #e8e8e8;
          }

          .ticket-menu-dropdown {
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 4px;
            background: #1c1c1e;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            padding: 8px 0;
            min-width: 160px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          }

          .ticket-menu-dropdown button {
            width: 100%;
            padding: 10px 16px;
            border: none;
            background: none;
            color: #e8e8e8;
            font-size: 14px;
            text-align: left;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .ticket-menu-dropdown button:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.1);
          }

          .ticket-menu-dropdown button:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }

          .menu-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
            margin: 8px 0;
          }

          /* Note/Label editor modals */
          .modal-small {
            max-width: 400px;
          }

          .note-input, .label-input {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-size: 16px;
            font-family: inherit;
            resize: vertical;
          }

          .note-input:focus, .label-input:focus {
            outline: none;
            border-color: #667eea;
          }

          .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 16px;
          }

          .btn-cancel {
            padding: 10px 20px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            background: none;
            color: #888;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }

          .btn-cancel:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #e8e8e8;
          }

          .btn-save {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }

          .btn-save:hover {
            opacity: 0.9;
          }

          .ticket-right {
            flex: 0 0 auto;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 12px;
            font-size: 25px;
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
            color: #888;
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
            color: #888;
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
            font-size: 25px;
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

          .time-clock-modal {
            max-width: 500px;
          }

          .time-clock-pin-input {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-bottom: 24px;
          }

          .time-clock-pin-input label {
            font-size: 16px;
            font-weight: 600;
            color: #e8e8e8;
          }

          .pin-input-large {
            width: 100%;
            padding: 20px;
            font-size: 48px;
            font-weight: 700;
            text-align: center;
            letter-spacing: 12px;
            border-radius: 12px;
            border: 2px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-family: monospace;
            transition: border-color 0.2s;
          }

          .pin-input-large:focus {
            outline: none;
            border-color: #667eea;
          }

          .pin-input-large:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .time-clock-error {
            padding: 12px 16px;
            background: rgba(255, 59, 48, 0.1);
            border: 1px solid rgba(255, 59, 48, 0.3);
            border-radius: 8px;
            color: #ff3b30;
            font-size: 14px;
            margin-bottom: 16px;
          }

          .time-clock-success {
            padding: 12px 16px;
            background: rgba(52, 199, 89, 0.1);
            border: 1px solid rgba(52, 199, 89, 0.3);
            border-radius: 8px;
            color: #34c759;
            font-size: 14px;
            margin-bottom: 16px;
          }

          .time-clock-actions {
            display: flex;
            gap: 12px;
          }

          .time-clock-button {
            flex: 1;
            padding: 16px 24px;
            border-radius: 12px;
            border: none;
            font-weight: 700;
            font-size: 18px;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
          }

          .clock-in-button {
            background: linear-gradient(135deg, #34c759 0%, #28a745 100%);
            color: white;
          }

          .clock-in-button:hover:not(:disabled) {
            opacity: 0.9;
            transform: translateY(-1px);
          }

          .clock-out-button {
            background: linear-gradient(135deg, #ff3b30 0%, #dc3545 100%);
            color: white;
          }

          .clock-out-button:hover:not(:disabled) {
            opacity: 0.9;
            transform: translateY(-1px);
          }

          .time-clock-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
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

          .start-button {
            background: linear-gradient(135deg, #ff9f0a 0%, #ff6b35 100%);
            color: white;
          }

          .start-button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(255, 159, 10, 0.4);
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

