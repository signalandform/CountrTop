import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { requireKDSSessionApi } from '../../../../../../lib/auth';

type UnholdResponse =
  | { ok: true }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UnholdResponse>
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
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    // Clear held status
    const { error } = await supabase
      .from('kitchen_tickets')
      .update({
        held_at: null,
        held_reason: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', ticketIdStr)
      .eq('location_id', locationId);

    if (error) {
      console.error('Error unholding ticket:', error);
      return res.status(500).json({ ok: false, error: 'Failed to unhold ticket' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Unexpected error unholding ticket:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

