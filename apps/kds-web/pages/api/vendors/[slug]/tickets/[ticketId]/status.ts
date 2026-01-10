import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import { sendOrderReady } from '@countrtop/email';
import { requireKDSSession } from '../../../../../../lib/auth';
import type { GetServerSidePropsContext } from 'next';

// =============================================================================
// Email Helper (optional - gracefully skips if not configured)
// =============================================================================

type EmailParams = {
  supabaseAdmin: SupabaseClient<Database>;
  dataClient: ReturnType<typeof createDataClient>;
  slug: string;
  locationId: string;
  customerUserId: string;
  shortcode: string;
};

async function sendOrderReadyEmail(params: EmailParams) {
  const { supabaseAdmin, dataClient, slug, locationId, customerUserId, shortcode } = params;
  
  try {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(customerUserId);
    const customerEmail = authUser?.user?.email;
    
    if (!customerEmail) {
      console.log('No customer email found for order ready notification');
      return;
    }
    
    const vendor = await dataClient.getVendorBySlug(slug);
    const vendorLocation = await dataClient.getVendorLocationById(locationId);
    const customerName = authUser.user?.user_metadata?.full_name || 
                         authUser.user?.user_metadata?.name ||
                         authUser.user?.email?.split('@')[0] || 
                         'Customer';
    
    // Use the @countrtop/email package
    const result = await sendOrderReady({
      customerEmail,
      customerName,
      vendorName: vendor?.displayName || vendor?.slug || 'Restaurant',
      shortcode,
      pickupInstructions: vendorLocation?.pickupInstructions ?? undefined
    });
    
    if (!result.success) {
      console.warn('Failed to send order ready email:', result.error);
    } else {
      console.log('Order ready email sent to', customerEmail);
    }
  } catch (err) {
    console.warn('Failed to send order ready email:', err);
  }
}

type StatusResponse =
  | {
      ok: true;
      ticket: {
        id: string;
        squareOrderId: string;
        locationId: string;
        status: 'placed' | 'preparing' | 'ready' | 'completed';
        placedAt: string;
        readyAt?: string | null;
        completedAt?: string | null;
        updatedAt: string;
      };
    }
  | { ok: false; error: string; statusCode?: number };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
  const ticketId = typeof req.query.ticketId === 'string' ? req.query.ticketId : null;
  const locationIdParam = typeof req.query.locationId === 'string' ? req.query.locationId : null;

  if (!slug || !ticketId) {
    return res.status(400).json({
      ok: false,
      error: 'Vendor slug and ticket ID required'
    });
  }

  const { status } = req.body;
  if (status !== 'preparing' && status !== 'ready' && status !== 'completed') {
    return res.status(400).json({
      ok: false,
      error: 'Invalid status. Must be "preparing", "ready", or "completed"'
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

    const locationId = locationIdParam || authResult.session.locationId;

    // Get vendor to verify location scoping
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

    // Verify ticket exists and belongs to this location
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('kitchen_tickets')
      .select('id, location_id')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({
        ok: false,
        error: 'Ticket not found'
      });
    }

    if (ticket.location_id !== locationId) {
      return res.status(403).json({
        ok: false,
        error: 'Ticket does not belong to this location',
        statusCode: 403
      });
    }

    // Update ticket status (no user ID needed for KDS)
    const updatedTicket = await dataClient.updateKitchenTicketStatus(
      ticketId,
      status
    );

    // Send order ready email when status changes to 'ready'
    if (status === 'ready' && updatedTicket.customerUserId && process.env.RESEND_API_KEY) {
      sendOrderReadyEmail({
        supabaseAdmin,
        dataClient,
        slug: slug!,
        locationId,
        customerUserId: updatedTicket.customerUserId,
        shortcode: updatedTicket.shortcode || updatedTicket.squareOrderId.slice(-4).toUpperCase()
      });
    }

    return res.status(200).json({
      ok: true,
      ticket: {
        id: updatedTicket.id,
        squareOrderId: updatedTicket.squareOrderId,
        locationId: updatedTicket.locationId,
        status: updatedTicket.status as 'placed' | 'preparing' | 'ready' | 'completed',
        placedAt: updatedTicket.placedAt,
        readyAt: updatedTicket.readyAt ?? null,
        completedAt: updatedTicket.completedAt ?? null,
        updatedAt: updatedTicket.updatedAt
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = error instanceof Error && error.message.includes('Invalid status transition') ? 400 : 500;
    return res.status(statusCode).json({
      ok: false,
      error: errorMessage
    });
  }
}

