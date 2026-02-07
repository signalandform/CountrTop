import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { requireKDSSession } from '../../../../../lib/auth';
import type { GetServerSidePropsContext } from 'next';

type CompletedTicketsResponse =
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
          source: 'countrtop_online' | 'square_pos';
          status: 'completed';
          shortcode?: string | null;
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
      }>;
    }
  | { ok: false; error: string; statusCode?: number };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CompletedTicketsResponse>
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
    const authResult = await requireKDSSession(mockContext, slug, locationIdParam ?? null);
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

    // Fetch completed tickets for the last 24 hours, filtered by locationId
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: ticketsData, error: ticketsError } = await supabaseAdmin
      .from('kitchen_tickets')
      .select(`
        id,
        square_order_id,
        location_id,
        ct_reference_id,
        customer_user_id,
        source,
        status,
        shortcode,
        placed_at,
        ready_at,
        completed_at,
        updated_at
      `)
      .eq('location_id', locationId)
      .eq('status', 'completed')
      .gte('completed_at', twentyFourHoursAgo)
      .order('completed_at', { ascending: false })
      .limit(50);

    if (ticketsError) {
      throw ticketsError;
    }

    if (!ticketsData || ticketsData.length === 0) {
      return res.status(200).json({
        ok: true,
        locationId,
        tickets: []
      });
    }

    // Fetch orders from square_orders table (has dedicated line_items column)
    const squareOrderIds = ticketsData.map(t => t.square_order_id).filter((id): id is string => id != null);
    const { data: ordersData, error: ordersError } = await supabaseAdmin
      .from('square_orders')
      .select('square_order_id, location_id, state, created_at, updated_at, reference_id, metadata, line_items, source')
      .in('square_order_id', squareOrderIds);

    if (ordersError) {
      throw ordersError;
    }

    // Map tickets with their orders
    const ordersMap = new Map(
      (ordersData || []).map(order => [order.square_order_id, order])
    );

    const tickets = ticketsData
      .map(ticketRow => {
        const ticket = ticketRow as Database['public']['Tables']['kitchen_tickets']['Row'];
        const orderId = ticket.square_order_id;
        if (!orderId) return null;
        const order = ordersMap.get(orderId);
        if (!order) return null;

        return {
          ticket: {
            id: ticket.id,
            squareOrderId: orderId,
            locationId: ticket.location_id,
            ctReferenceId: ticket.ct_reference_id ?? null,
            customerUserId: ticket.customer_user_id ?? null,
            source: ticket.source as 'countrtop_online' | 'square_pos',
            status: 'completed' as const,
            shortcode: ticket.shortcode ?? null,
            placedAt: ticket.placed_at,
            readyAt: ticket.ready_at ?? null,
            completedAt: ticket.completed_at ?? null,
            updatedAt: ticket.updated_at
          },
          order: {
            squareOrderId: order.square_order_id,
            locationId: order.location_id,
            state: order.state ?? 'UNKNOWN',
            createdAt: order.created_at,
            updatedAt: order.updated_at ?? order.created_at,
            referenceId: order.reference_id ?? null,
            metadata: order.metadata as Record<string, unknown> | null,
            lineItems: order.line_items as unknown[] | null,
            source: (order.source ?? ticket.source) as 'countrtop_online' | 'square_pos'
          }
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    return res.status(200).json({
      ok: true,
      locationId,
      tickets
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({
      ok: false,
      error: errorMessage
    });
  }
}

