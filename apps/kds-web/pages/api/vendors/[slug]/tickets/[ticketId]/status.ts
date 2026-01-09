import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
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
    
    if (!customerEmail) return;
    
    const vendor = await dataClient.getVendorBySlug(slug);
    const vendorLocation = await dataClient.getVendorLocationById(locationId);
    const customerName = authUser.user?.user_metadata?.full_name || 
                         authUser.user?.user_metadata?.name ||
                         authUser.user?.email?.split('@')[0] || 
                         'Customer';
    
    // Direct Resend API call
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${vendor?.slug || 'Restaurant'} <orders@countrtop.com>`,
        to: customerEmail,
        subject: `🎉 Your order is ready! - ${vendor?.slug || 'Restaurant'}`,
        html: generateOrderReadyHtml({
          customerName,
          vendorName: vendor?.slug || 'Restaurant',
          shortcode,
          pickupInstructions: vendorLocation?.pickupInstructions ?? undefined
        })
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.warn('Failed to send order ready email:', error);
    }
  } catch (err) {
    console.warn('Failed to send order ready email:', err);
  }
}

function generateOrderReadyHtml(data: {
  customerName: string;
  vendorName: string;
  shortcode: string;
  pickupInstructions?: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Order is Ready!</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f0f23; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f0f23; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px;">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: #34c759; font-size: 32px;">🎉 Your Order is Ready!</h1>
              <p style="margin: 10px 0 0; color: #a0a0a0;">${data.vendorName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px; text-align: center;">
              <div style="background: rgba(52, 199, 89, 0.15); border: 3px solid #34c759; border-radius: 16px; padding: 30px; display: inline-block;">
                <p style="margin: 0 0 8px; color: #34c759; font-size: 14px; text-transform: uppercase;">Show this code</p>
                <p style="margin: 0; color: #34c759; font-size: 56px; font-weight: 800; letter-spacing: 6px;">${data.shortcode}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; text-align: center;">
              <p style="margin: 0; color: #e8e8e8; font-size: 20px;">
                Hi ${data.customerName}, your order is waiting for you!
              </p>
            </td>
          </tr>
          ${data.pickupInstructions ? `
          <tr>
            <td style="padding: 20px 40px 30px;">
              <div style="background: rgba(102, 126, 234, 0.1); border: 1px solid rgba(102, 126, 234, 0.3); border-radius: 8px; padding: 16px; text-align: center;">
                <p style="margin: 0; color: #e8e8e8;">📍 ${data.pickupInstructions}</p>
              </div>
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 30px 40px; background: rgba(0,0,0,0.2); text-align: center;">
              <p style="margin: 0; color: #666; font-size: 12px;">Powered by CountrTop</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
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

