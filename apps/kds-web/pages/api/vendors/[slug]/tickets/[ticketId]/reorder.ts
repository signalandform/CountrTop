import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { requireKDSSessionApi } from '../../../../../../lib/auth';

type ReorderResponse =
  | { ok: true }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReorderResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { slug, ticketId } = req.query;
  const slugStr = Array.isArray(slug) ? slug[0] : slug;
  const ticketIdStr = Array.isArray(ticketId) ? ticketId[0] : ticketId;
  const locationId = req.query.locationId as string | undefined;

  // Check KDS session
  const authResult = await requireKDSSessionApi(req, res, slugStr, locationId);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 401).json({
      ok: false,
      error: authResult.error || 'Unauthorized'
    });
  }

  try {
    const { direction } = req.body;
    
    if (direction !== 'up' && direction !== 'down') {
      return res.status(400).json({ ok: false, error: 'Invalid direction' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    // Get current ticket
    const { data: currentTicket, error: fetchError } = await supabase
      .from('kitchen_tickets')
      .select('id, priority_order, placed_at')
      .eq('id', ticketIdStr)
      .eq('location_id', locationId)
      .single();

    if (fetchError || !currentTicket) {
      return res.status(404).json({ ok: false, error: 'Ticket not found' });
    }

    // Get all active tickets sorted by priority
    const { data: allTickets, error: listError } = await supabase
      .from('kitchen_tickets')
      .select('id, priority_order')
      .eq('location_id', locationId)
      .in('status', ['placed', 'preparing', 'ready'])
      .is('held_at', null)
      .order('priority_order', { ascending: true })
      .order('placed_at', { ascending: true });

    if (listError) {
      return res.status(500).json({ ok: false, error: 'Failed to fetch tickets' });
    }

    // Find current ticket index
    const currentIndex = allTickets?.findIndex(t => t.id === ticketIdStr) ?? -1;
    if (currentIndex === -1) {
      return res.status(404).json({ ok: false, error: 'Ticket not in active queue' });
    }

    // Calculate swap index
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= (allTickets?.length ?? 0)) {
      return res.status(400).json({ ok: false, error: 'Cannot move further' });
    }

    const swapTicket = allTickets![swapIndex];

    // Swap priority_order values
    const currentPriority = currentTicket.priority_order ?? 0;
    const swapPriority = swapTicket.priority_order ?? 0;

    // Update both tickets
    const { error: updateError1 } = await supabase
      .from('kitchen_tickets')
      .update({ priority_order: swapPriority, updated_at: new Date().toISOString() })
      .eq('id', ticketIdStr);

    const { error: updateError2 } = await supabase
      .from('kitchen_tickets')
      .update({ priority_order: currentPriority, updated_at: new Date().toISOString() })
      .eq('id', swapTicket.id);

    if (updateError1 || updateError2) {
      console.error('Error reordering tickets:', updateError1 || updateError2);
      return res.status(500).json({ ok: false, error: 'Failed to reorder tickets' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Unexpected error reordering ticket:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

