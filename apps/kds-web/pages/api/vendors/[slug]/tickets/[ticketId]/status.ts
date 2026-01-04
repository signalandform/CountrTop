import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import { verifyVendorAdminAccess } from '../../../../../../lib/auth';
import { createServerClient } from '@supabase/auth-helpers-nextjs';

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

  if (!slug || !ticketId) {
    return res.status(400).json({
      ok: false,
      error: 'Vendor slug and ticket ID required'
    });
  }

  const { status } = req.body;
  if (status !== 'ready' && status !== 'completed') {
    return res.status(400).json({
      ok: false,
      error: 'Invalid status. Must be "ready" or "completed"'
    });
  }

  try {
    // Get user from session
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
      {
        cookies: {
          get(name: string) {
            return req.cookies[name] ?? undefined;
          },
          set() {
            // No-op for POST requests
          },
          remove() {
            // No-op for POST requests
          }
        }
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized',
        statusCode: 401
      });
    }

    // Verify vendor admin access
    const authResult = await verifyVendorAdminAccess(slug, user.id);
    if (!authResult.authorized) {
      return res.status(authResult.statusCode || 403).json({
        ok: false,
        error: authResult.error || 'Forbidden',
        statusCode: authResult.statusCode || 403
      });
    }

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
    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor || !vendor.squareLocationId) {
      return res.status(404).json({
        ok: false,
        error: 'Vendor not found or missing Square location ID'
      });
    }

    // Verify ticket belongs to vendor's location (scoping enforcement)

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

    if (ticket.location_id !== vendor.squareLocationId) {
      return res.status(403).json({
        ok: false,
        error: 'Ticket does not belong to this vendor location',
        statusCode: 403
      });
    }

    // Update ticket status
    const updatedTicket = await dataClient.updateKitchenTicketStatus(
      ticketId,
      status,
      user.id
    );

    // If ticket was completed, try to promote the next queued ticket
    if (status === 'completed' && vendor) {
      try {
        await dataClient.promoteQueuedTicket(vendor.squareLocationId, vendor);
      } catch (error) {
        // Log but don't fail - promotion is best-effort
        console.warn('Failed to promote queued ticket after completion', {
          locationId: vendor.squareLocationId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
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

