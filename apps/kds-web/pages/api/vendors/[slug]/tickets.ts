import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import type { OrderSource } from '@countrtop/models';
import { requireKDSSession } from '../../../../lib/auth';
import type { GetServerSidePropsContext } from 'next';

type CustomerInfo = {
  displayName?: string | null;
  loyaltyPoints?: number | null;
  isLoyaltyMember: boolean;
};

type TicketsResponse =
  | {
      ok: true;
      locationId: string;
      tickets: Array<{
        ticket: {
          id: string;
          squareOrderId: string;
          locationId: string;
          ctReferenceId?: string | null;
          customerUserId?: string | null;
          source: OrderSource;
          status: 'placed' | 'preparing' | 'ready';
          shortcode?: string | null;
          placedAt: string;
          readyAt?: string | null;
          completedAt?: string | null;
          updatedAt: string;
          // New fields for hold/notes/reorder
          heldAt?: string | null;
          heldReason?: string | null;
          staffNotes?: string | null;
          customLabel?: string | null;
          priorityOrder?: number;
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
          source: OrderSource;
          scheduledPickupAt?: string | null;
        };
        customer?: CustomerInfo;
      }>;
    }
  | { ok: false; error: string; statusCode?: number };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TicketsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
  const locationIdParam = typeof req.query.locationId === 'string' ? req.query.locationId : null;

  if (!slug) {
    return res.status(400).json({
      ok: false,
      error: 'Vendor slug required'
    });
  }

  try {
    // Create a mock context for requireKDSSession
    const mockContext = {
      req: req,
      res: res,
      query: req.query,
      params: { slug }
    } as unknown as GetServerSidePropsContext;

    // Verify KDS session
    const authResult = await requireKDSSession(mockContext, slug, locationIdParam);
    if (!authResult.authorized) {
      return res.status(authResult.statusCode || 401).json({
        ok: false,
        error: authResult.error || 'Unauthorized',
        statusCode: authResult.statusCode || 401
      });
    }

    // Use locationId from session or query param
    const locationId = locationIdParam || authResult.session.locationId;

    // Get data client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        ok: false,
        error: 'Server configuration error'
      });
    }
    const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase: supabaseAdmin });

    // Fetch vendor for loyalty lookups
    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor) {
      return res.status(404).json({
        ok: false,
        error: 'Vendor not found'
      });
    }

    // Fetch active tickets filtered by locationId
    const tickets = await dataClient.listActiveKitchenTickets(locationId);

    // Batch fetch customer data to avoid N+1 queries
    // 1. Collect unique customer user IDs and square order IDs for online orders
    const onlineTickets = tickets.filter(
      t => t.ticket.source === 'countrtop_online' && t.ticket.customerUserId
    );
    const customerUserIds = [...new Set(onlineTickets.map(t => t.ticket.customerUserId!))];
    const squareOrderIds = onlineTickets.map(t => t.ticket.squareOrderId);

    // 2. Batch fetch loyalty balances (parallel)
    const loyaltyMap = new Map<string, number>();
    if (customerUserIds.length > 0) {
      const loyaltyPromises = customerUserIds.map(async userId => {
        try {
          const balance = await dataClient.getLoyaltyBalance(vendor.id, userId);
          loyaltyMap.set(userId, balance);
        } catch {
          loyaltyMap.set(userId, 0);
        }
      });
      await Promise.all(loyaltyPromises);
    }

    // 3. Batch fetch order snapshots (single query)
    const snapshotMap = new Map<string, { displayName: string | null; pickupLabel: string | null }>();
    if (squareOrderIds.length > 0) {
      try {
        const { data: snapshots } = await supabaseAdmin
          .from('order_snapshots')
          .select('square_order_id, customer_display_name, pickup_label')
          .eq('vendor_id', vendor.id)
          .in('square_order_id', squareOrderIds);
        
        if (snapshots) {
          for (const s of snapshots) {
            snapshotMap.set(s.square_order_id, {
              displayName: s.customer_display_name,
              pickupLabel: s.pickup_label
            });
          }
        }
      } catch (err) {
        console.warn('Failed to batch fetch order snapshots:', err);
      }
    }

    const extractScheduledPickupAt = (fulfillment: unknown): string | null => {
      if (!fulfillment) return null;
      const arr = Array.isArray(fulfillment) ? fulfillment : [fulfillment];
      for (const f of arr) {
        const details = (f as Record<string, unknown>)?.pickupDetails ?? (f as Record<string, unknown>)?.pickup_details;
        if (details && typeof details === 'object') {
          const at = (details as Record<string, unknown>).pickupAt ?? (details as Record<string, unknown>).pickup_at;
          if (typeof at === 'string' && at) return at;
        }
      }
      return null;
    };

    // 4. Build enriched tickets with cached customer data
    const enrichedTickets = tickets.map(({ ticket, order }) => {
      let customer: CustomerInfo | undefined;

      if (ticket.source === 'countrtop_online' && ticket.customerUserId) {
        const loyaltyPoints = loyaltyMap.get(ticket.customerUserId) ?? 0;
        const snapshotData = snapshotMap.get(ticket.squareOrderId);
        const displayName = snapshotData?.displayName ?? snapshotData?.pickupLabel ?? null;

        customer = {
          displayName,
          loyaltyPoints: loyaltyPoints > 0 ? loyaltyPoints : null,
          isLoyaltyMember: loyaltyPoints > 0
        };
      }

      return {
        ticket: {
          id: ticket.id,
          squareOrderId: ticket.squareOrderId,
          locationId: ticket.locationId,
          ctReferenceId: ticket.ctReferenceId ?? null,
          customerUserId: ticket.customerUserId ?? null,
          source: ticket.source,
          status: ticket.status as 'placed' | 'preparing' | 'ready',
          shortcode: ticket.shortcode ?? null,
          placedAt: ticket.placedAt,
          readyAt: ticket.readyAt ?? null,
          completedAt: ticket.completedAt ?? null,
          updatedAt: ticket.updatedAt,
          // New fields
          heldAt: (ticket as Record<string, unknown>).heldAt as string | null ?? null,
          heldReason: (ticket as Record<string, unknown>).heldReason as string | null ?? null,
          staffNotes: (ticket as Record<string, unknown>).staffNotes as string | null ?? null,
          customLabel: (ticket as Record<string, unknown>).customLabel as string | null ?? null,
          priorityOrder: (ticket as Record<string, unknown>).priorityOrder as number ?? 0
        },
        order: {
          squareOrderId: order.squareOrderId,
          locationId: order.locationId,
          state: order.state,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          referenceId: order.referenceId ?? null,
          metadata: order.metadata ?? null,
          lineItems: order.lineItems ?? null,
          source: order.source,
          scheduledPickupAt: extractScheduledPickupAt(order.fulfillment) ?? (order.metadata as Record<string, unknown> | null)?.ct_scheduled_pickup_at as string | null ?? null
        },
        customer
      };
    });

    return res.status(200).json({
      ok: true,
      locationId,
      tickets: enrichedTickets
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({
      ok: false,
      error: errorMessage
    });
  }
}

