import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { requireKDSSession } from '../../../../../../lib/auth';
import type { GetServerSidePropsContext } from 'next';

type LabelResponse =
  | { ok: true }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LabelResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
  const ticketId = typeof req.query.ticketId === 'string' ? req.query.ticketId : null;
  const locationIdParam = typeof req.query.locationId === 'string' ? req.query.locationId : null;

  if (!slug || !ticketId) {
    return res.status(400).json({ ok: false, error: 'Vendor slug and ticket ID required' });
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
        error: authResult.error || 'Unauthorized'
      });
    }

    const locationId = locationIdParam || authResult.session.locationId;
    const { label } = req.body;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    // Update custom label
    const { error } = await supabase
      .from('kitchen_tickets')
      .update({
        custom_label: label || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', ticketId)
      .eq('location_id', locationId);

    if (error) {
      console.error('Error saving label:', error);
      return res.status(500).json({ ok: false, error: 'Failed to save label' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Unexpected error saving label:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
