import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { CustomerTrackingState } from '@countrtop/models';

type TrackingResponse =
  | {
      ok: true;
      tracking: {
        state: CustomerTrackingState;
        shortcode: string | null;
        status: string;
        message: string;
      };
    }
  | { ok: false; error: string };

/**
 * GET /api/vendors/[slug]/orders/[orderId]/tracking
 * Returns customer tracking state for an order
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TrackingResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  const slugParam = req.query.slug;
  const orderIdParam = req.query.orderId;
  const vendorSlug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const orderId = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;

  if (!vendorSlug || !orderId) {
    return res.status(400).json({
      ok: false,
      error: 'Vendor slug and order ID required'
    });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        ok: false,
        error: 'Server configuration error'
      });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    // Get vendor
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, square_location_id')
      .eq('slug', vendorSlug)
      .single();

    if (vendorError || !vendor) {
      return res.status(404).json({
        ok: false,
        error: 'Vendor not found'
      });
    }

    // Find kitchen ticket by square_order_id or ct_reference_id
    const { data: ticket, error: ticketError } = await supabase
      .from('kitchen_tickets')
      .select('id, status, shortcode, promoted_at, placed_at, ready_at, completed_at')
      .eq('location_id', vendor.square_location_id)
      .or(`square_order_id.eq.${orderId},ct_reference_id.eq.${orderId}`)
      .maybeSingle();

    if (ticketError) {
      return res.status(500).json({
        ok: false,
        error: `Database error: ${ticketError.message}`
      });
    }

    if (!ticket) {
      // Order not found in kitchen tickets - might be queued or not yet processed
      return res.status(200).json({
        ok: true,
        tracking: {
          state: 'queued_up',
          shortcode: null,
          status: 'placed',
          message: 'Kitchen is super hot right now...'
        }
      });
    }

    // Determine tracking state
    let state: CustomerTrackingState;
    let message: string;

    if (ticket.status === 'completed') {
      state = 'enjoy';
      message = 'Enjoy the food!';
    } else if (ticket.status === 'ready') {
      state = 'ready';
      message = 'Show this code to staff';
    } else if (ticket.promoted_at) {
      state = 'working';
      message = 'Your order is being prepared...';
    } else {
      state = 'queued_up';
      message = 'Kitchen is super hot right now...';
    }

    return res.status(200).json({
      ok: true,
      tracking: {
        state,
        shortcode: ticket.shortcode,
        status: ticket.status,
        message
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({
      ok: false,
      error: errorMessage
    });
  }
}

