import { Vendor } from './models';
import { getSquareOrder, listSquareOrdersUpdatedSince } from '@countrtop/api-client';
import { DataClient } from './dataClient';
import { createLogger } from '@countrtop/api-client';

const logger = createLogger({ requestId: 'reconcile' });

export type ReconcileStats = {
  processed: number;
  createdTickets: number;
  updatedTickets: number;
  errors: number;
};

/**
 * Processes orders with concurrency control
 */
async function processBatch<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(processor));
  }
}

/**
 * Reconciles Square orders for a location by polling orders updated in the last N minutes
 * @param dataClient - Data client instance
 * @param vendor - Vendor object with Square credentials
 * @param locationId - Square location ID to reconcile
 * @param minutesBack - How many minutes back to look (default: 10)
 * @returns Statistics about the reconciliation run
 */
export async function reconcileSquareOrdersForLocation(
  dataClient: DataClient,
  vendor: Vendor,
  locationId: string,
  minutesBack = 10
): Promise<ReconcileStats> {
  const stats: ReconcileStats = {
    processed: 0,
    createdTickets: 0,
    updatedTickets: 0,
    errors: 0
  };

  try {
    // Compute updatedSince timestamp
    const now = new Date();
    const updatedSince = new Date(now.getTime() - minutesBack * 60 * 1000);
    const updatedSinceISO = updatedSince.toISOString();

    logger.info('Starting reconciliation', {
      locationId,
      minutesBack,
      updatedSinceISO
    });

    // Get list of order IDs updated since the timestamp
    const orderIds = await listSquareOrdersUpdatedSince(vendor, locationId, updatedSinceISO);

    logger.info('Found orders to reconcile', {
      locationId,
      orderCount: orderIds.length
    });

    if (orderIds.length === 0) {
      return stats;
    }

    // Process orders with concurrency limit (5 at a time)
    const concurrencyLimit = 5;
    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    await processBatch(orderIds, concurrencyLimit, async (orderId) => {
      try {
        // Fetch full order
        const order = await getSquareOrder(vendor, orderId);
        processedCount++;

        // Upsert square order
        await dataClient.upsertSquareOrderFromSquare(order);

        // Check if ticket exists before processing
        // We'll check by querying the database
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        let ticketExistedBefore = false;
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false }
          });
          const { data: existingTicket } = await supabase
            .from('kitchen_tickets')
            .select('id')
            .eq('square_order_id', orderId)
            .maybeSingle();
          ticketExistedBefore = !!existingTicket;
        }

        // Ensure ticket for OPEN orders
        if (order.state === 'OPEN') {
          await dataClient.ensureKitchenTicketForOpenOrder(order);
          if (!ticketExistedBefore) {
            createdCount++;
          }
          
          // Try to promote a queued ticket (best-effort, don't fail on error)
          try {
            await dataClient.promoteQueuedTicket(locationId, vendor);
          } catch (error) {
            // Log but don't fail - promotion is best-effort
            logger.warn(`Failed to promote queued ticket during reconciliation`, {
              locationId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        // Update ticket for terminal states
        if (order.state === 'COMPLETED' || order.state === 'CANCELED') {
          await dataClient.updateTicketForTerminalOrderState(order);
          if (ticketExistedBefore) {
            updatedCount++;
          }
          
          // When a ticket completes, try to promote the next queued ticket
          try {
            await dataClient.promoteQueuedTicket(locationId, vendor);
          } catch (error) {
            // Log but don't fail - promotion is best-effort
            logger.warn(`Failed to promote queued ticket after completion`, {
              locationId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      } catch (error) {
        errorCount++;
        logger.error(`Failed to reconcile order ${orderId}`, error instanceof Error ? error : new Error(String(error)), {
          orderId,
          locationId
        });
      }
    });

    stats.processed = processedCount;
    stats.createdTickets = createdCount;
    stats.updatedTickets = updatedCount;
    stats.errors = errorCount;

    logger.info('Reconciliation complete', {
      locationId,
      ...stats
    });

    return stats;
  } catch (error) {
    logger.error('Reconciliation failed', error instanceof Error ? error : new Error(String(error)), {
      locationId,
      minutesBack
    });
    throw error;
  }
}

