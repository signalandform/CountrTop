import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { requireKDSSession } from '../../../../../../lib/auth';
import type { GetServerSidePropsContext } from 'next';

type RecallResponse =
  | {
      ok: true;
      ticket: {
        id: string;
        squareOrderId: string;
        locationId: string;
        status: 'ready';
        placedAt: string;
        readyAt?: string | null;
        completedAt?: string | null;
        updatedAt: string;
      };
    }
  | { ok: false; error: string; statusCode?: number };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RecallResponse>
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

    // Verify ticket exists and belongs to this location
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('kitchen_tickets')
      .select('id, location_id, status')
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
        error: 'Ticket does not belong to this location'
      });
    }

    if (ticket.status !== 'completed') {
      return res.status(400).json({
        ok: false,
        error: 'Ticket is not completed. Only completed tickets can be recalled.'
      });
    }

    // Update ticket status from completed to ready
    // Clear completed_at and set ready_at to now
    const now = new Date().toISOString();
    const { data: updatedTicket, error: updateError } = await supabaseAdmin
      .from('kitchen_tickets')
      .update({
        status: 'ready',
        completed_at: null,
        ready_at: now,
        updated_at: now
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (updateError || !updatedTicket) {
      throw updateError || new Error('Failed to update ticket');
    }

    const ticketRow = updatedTicket as Database['public']['Tables']['kitchen_tickets']['Row'];

    return res.status(200).json({
      ok: true,
      ticket: {
        id: ticketRow.id,
        squareOrderId: ticketRow.square_order_id,
        locationId: ticketRow.location_id,
        status: 'ready' as const,
        placedAt: ticketRow.placed_at,
        readyAt: ticketRow.ready_at ?? null,
        completedAt: ticketRow.completed_at ?? null,
        updatedAt: ticketRow.updated_at
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

