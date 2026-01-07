import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { resolveVendorSlugFromHost, createDataClient } from '@countrtop/data';

type OrderStatus = {
  status: 'placed' | 'preparing' | 'ready' | 'completed' | 'unknown';
  shortcode?: string | null;
  placedAt?: string;
  readyAt?: string | null;
  completedAt?: string | null;
  estimatedWaitMinutes?: number | null;
};

type StatusResponse =
  | { ok: true; order: OrderStatus }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : null;
  if (!orderId) {
    return res.status(400).json({ ok: false, error: 'Order ID required' });
  }

  // Resolve vendor from host
  const fallback = process.env.DEFAULT_VENDOR_SLUG;
  const vendorSlug = resolveVendorSlugFromHost(req.headers.host, fallback);
  if (!vendorSlug) {
    return res.status(400).json({ ok: false, error: 'Vendor not found' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase: supabaseAdmin });

    // Get vendor
    const vendor = await dataClient.getVendorBySlug(vendorSlug);
    if (!vendor) {
      return res.status(404).json({ ok: false, error: 'Vendor not found' });
    }

    // The orderId could be:
    // 1. A ct_reference_id (starts with ct_)
    // 2. A square_order_id
    
    // Build query based on orderId format
    let ticketQuery = supabaseAdmin
      .from('kitchen_tickets')
      .select('id, status, shortcode, placed_at, ready_at, completed_at, ct_reference_id, square_order_id, location_id')
      .eq('location_id', vendor.squareLocationId);
    
    // Use appropriate filter based on ID format
    if (orderId.startsWith('ct_')) {
      ticketQuery = ticketQuery.eq('ct_reference_id', orderId);
    } else {
      ticketQuery = ticketQuery.eq('square_order_id', orderId);
    }
    
    const { data: ticketData, error: ticketError } = await ticketQuery.maybeSingle();

    if (ticketError) {
      console.error('Error fetching ticket:', ticketError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch order status' });
    }

    if (!ticketData) {
      // Order might not have a ticket yet (still processing)
      return res.status(200).json({
        ok: true,
        order: {
          status: 'unknown',
          estimatedWaitMinutes: null
        }
      });
    }

    // Calculate estimated wait based on daily average (if available)
    let estimatedWaitMinutes: number | null = null;
    if (ticketData.status !== 'completed' && ticketData.status !== 'ready') {
      // Get recent prep times to estimate wait
      const { data: recentTickets } = await supabaseAdmin
        .from('kitchen_tickets')
        .select('placed_at, ready_at')
        .eq('location_id', vendor.squareLocationId)
        .eq('status', 'completed')
        .not('ready_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(20);

      if (recentTickets && recentTickets.length > 0) {
        const avgPrepMs = recentTickets
          .filter(t => t.placed_at && t.ready_at)
          .map(t => new Date(t.ready_at!).getTime() - new Date(t.placed_at).getTime())
          .reduce((sum, ms) => sum + ms, 0) / recentTickets.length;
        
        const elapsedMs = Date.now() - new Date(ticketData.placed_at).getTime();
        const remainingMs = Math.max(0, avgPrepMs - elapsedMs);
        estimatedWaitMinutes = Math.ceil(remainingMs / 60000);
      }
    }

    // Add cache headers to reduce server load from polling
    // Short cache for active orders, longer for completed
    const cacheSeconds = ticketData.status === 'completed' ? 300 : 5;
    res.setHeader('Cache-Control', `private, max-age=${cacheSeconds}`);

    return res.status(200).json({
      ok: true,
      order: {
        status: ticketData.status as OrderStatus['status'],
        shortcode: ticketData.shortcode,
        placedAt: ticketData.placed_at,
        readyAt: ticketData.ready_at,
        completedAt: ticketData.completed_at,
        estimatedWaitMinutes
      }
    });
  } catch (error) {
    console.error('Error in order status:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

