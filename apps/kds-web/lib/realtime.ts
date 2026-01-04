/**
 * Realtime subscription utilities for KDS
 * 
 * Provides:
 * - Supabase Realtime subscriptions for kitchen_tickets
 * - Event handling (INSERT, UPDATE, DELETE)
 * - Connection state management
 * - Subscription lifecycle management
 */

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export type TicketChangeEvent = {
  eventType: RealtimeEventType;
  ticketId: string;
  newRecord?: Database['public']['Tables']['kitchen_tickets']['Row'];
  oldRecord?: Database['public']['Tables']['kitchen_tickets']['Row'];
};

export type SubscriptionCallbacks = {
  onInsert?: (event: TicketChangeEvent) => void;
  onUpdate?: (event: TicketChangeEvent) => void;
  onDelete?: (event: TicketChangeEvent) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED') => void;
};

export type SubscriptionState = {
  subscribed: boolean;
  connecting: boolean;
  error: Error | null;
  status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'UNKNOWN';
};

/**
 * Creates and manages a Supabase Realtime subscription for kitchen_tickets
 * 
 * @param supabase - Supabase client instance
 * @param locationId - Location ID to filter tickets
 * @param callbacks - Event callbacks
 * @returns Subscription cleanup function
 */
export function createTicketsSubscription(
  supabase: SupabaseClient<Database>,
  locationId: string,
  callbacks: SubscriptionCallbacks
): () => void {
  const channelName = `kds-tickets-${locationId}`;
  
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*', // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'kitchen_tickets',
        filter: `location_id=eq.${locationId}`,
      },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        handleRealtimeEvent(payload, callbacks);
      }
    )
    .subscribe((status) => {
      if (callbacks.onStatusChange) {
        callbacks.onStatusChange(status);
      }
      
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        const error = new Error(`Realtime subscription error: ${status}`);
        if (callbacks.onError) {
          callbacks.onError(error);
        }
      }
    });

  // Return cleanup function
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Handles a realtime postgres change event
 */
function handleRealtimeEvent(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  callbacks: SubscriptionCallbacks
): void {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  // Extract ticket ID from new or old record
  const ticketId = (newRecord && typeof newRecord === 'object' && 'id' in newRecord ? newRecord.id : null) ||
                   (oldRecord && typeof oldRecord === 'object' && 'id' in oldRecord ? oldRecord.id : null);

  if (!ticketId || typeof ticketId !== 'string') {
    console.warn('Realtime event missing ticket ID:', payload);
    return;
  }

  const event: TicketChangeEvent = {
    eventType: eventType as RealtimeEventType,
    ticketId,
    newRecord: newRecord as Database['public']['Tables']['kitchen_tickets']['Row'] | undefined,
    oldRecord: oldRecord as Database['public']['Tables']['kitchen_tickets']['Row'] | undefined,
  };

  switch (eventType) {
    case 'INSERT':
      if (callbacks.onInsert) {
        callbacks.onInsert(event);
      }
      break;
    case 'UPDATE':
      if (callbacks.onUpdate) {
        callbacks.onUpdate(event);
      }
      break;
    case 'DELETE':
      if (callbacks.onDelete) {
        callbacks.onDelete(event);
      }
      break;
    default:
      console.warn(`Unknown realtime event type: ${eventType}`);
  }
}

/**
 * React hook for managing kitchen tickets realtime subscription
 * 
 * Note: This is a utility function, not a React hook. 
 * Use it inside useEffect for proper lifecycle management.
 */
export function useKitchenTicketsRealtime(
  supabase: SupabaseClient<Database> | null,
  locationId: string | null,
  callbacks: SubscriptionCallbacks
): SubscriptionState {
  // This is a utility function, not a React hook
  // The actual hook will be implemented in the component
  throw new Error(
    'useKitchenTicketsRealtime is a utility function. Use createTicketsSubscription inside useEffect instead.'
  );
}

