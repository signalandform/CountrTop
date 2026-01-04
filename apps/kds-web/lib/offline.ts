/**
 * Offline support utilities for KDS
 * 
 * Provides:
 * - Local cache for tickets (localStorage)
 * - Offline action queue (localStorage)
 * - Online/offline detection
 * - Sync helpers
 */

export type Ticket = {
  ticket: {
    id: string;
    squareOrderId: string;
    locationId: string;
    ctReferenceId?: string | null;
    customerUserId?: string | null;
    source: 'countrtop_online' | 'square_pos' | 'delivery_service';
    status: 'placed' | 'preparing' | 'ready';
    shortcode?: string | null;
    promotedAt?: string | null;
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
    source: 'countrtop_online' | 'square_pos' | 'delivery_service';
  };
};

export type OfflineAction = {
  id: string;
  ticketId: string;
  newStatus: 'ready' | 'completed';
  createdAt: string;
  attempts: number;
};

type CachedTickets = {
  savedAt: string;
  tickets: Ticket[];
};

// Storage keys
const getCacheKey = (vendorSlug: string): string => `kds_cache_tickets:${vendorSlug}`;
const getQueueKey = (vendorSlug: string): string => `kds_queue_actions:${vendorSlug}`;

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine;
  }
  return true; // Assume online if can't determine
}

/**
 * Save tickets to local cache
 */
export function saveTicketsToCache(vendorSlug: string, tickets: Ticket[]): void {
  try {
    const cache: CachedTickets = {
      savedAt: new Date().toISOString(),
      tickets
    };
    localStorage.setItem(getCacheKey(vendorSlug), JSON.stringify(cache));
  } catch (error) {
    console.error('Failed to save tickets to cache:', error);
  }
}

/**
 * Load tickets from local cache
 */
export function loadTicketsFromCache(vendorSlug: string): Ticket[] | null {
  try {
    const cached = localStorage.getItem(getCacheKey(vendorSlug));
    if (!cached) return null;
    
    const cache: CachedTickets = JSON.parse(cached);
    return cache.tickets;
  } catch (error) {
    console.error('Failed to load tickets from cache:', error);
    return null;
  }
}

/**
 * Clear tickets cache
 */
export function clearTicketsCache(vendorSlug: string): void {
  try {
    localStorage.removeItem(getCacheKey(vendorSlug));
  } catch (error) {
    console.error('Failed to clear tickets cache:', error);
  }
}

/**
 * Add action to offline queue
 */
export function queueOfflineAction(
  vendorSlug: string,
  ticketId: string,
  newStatus: 'ready' | 'completed'
): void {
  try {
    const queue = getOfflineQueue(vendorSlug);
    const action: OfflineAction = {
      id: crypto.randomUUID(),
      ticketId,
      newStatus,
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    queue.push(action);
    localStorage.setItem(getQueueKey(vendorSlug), JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to queue offline action:', error);
  }
}

/**
 * Get all queued offline actions
 */
export function getOfflineQueue(vendorSlug: string): OfflineAction[] {
  try {
    const queued = localStorage.getItem(getQueueKey(vendorSlug));
    if (!queued) return [];
    return JSON.parse(queued) as OfflineAction[];
  } catch (error) {
    console.error('Failed to get offline queue:', error);
    return [];
  }
}

/**
 * Remove action from queue (after successful sync)
 */
export function removeQueuedAction(vendorSlug: string, actionId: string): void {
  try {
    const queue = getOfflineQueue(vendorSlug);
    const filtered = queue.filter(a => a.id !== actionId);
    localStorage.setItem(getQueueKey(vendorSlug), JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove queued action:', error);
  }
}

/**
 * Increment attempt count for a queued action
 */
export function incrementActionAttempts(vendorSlug: string, actionId: string): void {
  try {
    const queue = getOfflineQueue(vendorSlug);
    const action = queue.find(a => a.id === actionId);
    if (action) {
      action.attempts += 1;
      localStorage.setItem(getQueueKey(vendorSlug), JSON.stringify(queue));
    }
  } catch (error) {
    console.error('Failed to increment action attempts:', error);
  }
}

/**
 * Clear all queued actions
 */
export function clearOfflineQueue(vendorSlug: string): void {
  try {
    localStorage.removeItem(getQueueKey(vendorSlug));
  } catch (error) {
    console.error('Failed to clear offline queue:', error);
  }
}

/**
 * Sync queued actions to server
 * Returns array of action IDs that were successfully synced
 */
export async function syncOfflineQueue(
  vendorSlug: string,
  onActionSync: (action: OfflineAction) => Promise<boolean>
): Promise<string[]> {
  if (!isOnline()) {
    return [];
  }

  const queue = getOfflineQueue(vendorSlug);
  if (queue.length === 0) {
    return [];
  }

  const syncedIds: string[] = [];
  const errors: Array<{ actionId: string; error: Error }> = [];

  // Process queue sequentially to avoid race conditions
  for (const action of queue) {
    try {
      const success = await onActionSync(action);
      if (success) {
        syncedIds.push(action.id);
        removeQueuedAction(vendorSlug, action.id);
      } else {
        // Increment attempts for retry later
        incrementActionAttempts(vendorSlug, action.id);
        // Don't retry if too many attempts (prevent infinite queue)
        if (action.attempts >= 5) {
          console.warn(`Action ${action.id} failed after ${action.attempts} attempts, removing from queue`);
          removeQueuedAction(vendorSlug, action.id);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push({ actionId: action.id, error: err });
      incrementActionAttempts(vendorSlug, action.id);
      
      // Remove if too many attempts
      if (action.attempts >= 5) {
        removeQueuedAction(vendorSlug, action.id);
      }
    }
  }

  if (errors.length > 0) {
    console.error('Some actions failed to sync:', errors);
  }

  return syncedIds;
}

/**
 * Apply optimistic update to cached tickets
 * (Remove ticket when completed, update status when ready)
 */
export function applyOptimisticUpdateToCache(
  vendorSlug: string,
  ticketId: string,
  newStatus: 'ready' | 'completed'
): void {
  const cached = loadTicketsFromCache(vendorSlug);
  if (!cached) return;

  if (newStatus === 'completed') {
    // Remove completed tickets from cache
    const updated = cached.filter(t => t.ticket.id !== ticketId);
    saveTicketsToCache(vendorSlug, updated);
  } else if (newStatus === 'ready') {
    // Update status to ready
    const updated = cached.map(t => {
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
    });
    saveTicketsToCache(vendorSlug, updated);
  }
}

