import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { createDataClient } from '@countrtop/data';
import { requireKDSSession } from '../../../../lib/auth';
import type { GetServerSidePropsContext } from 'next';

type KdsSettingsResponse =
  | { ok: true; kdsNavView: 'full' | 'minimized' }
  | { ok: false; error: string };

const normalizeSlug = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<KdsSettingsResponse>
) {
  const slug = normalizeSlug(req.query.slug);
  const locationIdParam = typeof req.query.locationId === 'string' ? req.query.locationId : null;

  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  try {
    const mockContext = {
      req,
      res,
      query: req.query,
      params: { slug }
    } as unknown as GetServerSidePropsContext;

    const authResult = await requireKDSSession(mockContext, slug, locationIdParam);
    if (!authResult.authorized) {
      return res.status(authResult.statusCode || 401).json({
        ok: false,
        error: authResult.error || 'Unauthorized'
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase });

    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor) {
      return res.status(404).json({ ok: false, error: 'Vendor not found' });
    }

    if (req.method === 'GET') {
      const kdsNavView = (vendor.kdsNavView === 'minimized' ? 'minimized' : 'full') as 'full' | 'minimized';
      return res.status(200).json({ ok: true, kdsNavView });
    }

    if (req.method === 'PATCH') {
      const body = req.body as { kdsNavView?: string };
      const kdsNavView = body?.kdsNavView;
      if (kdsNavView !== 'full' && kdsNavView !== 'minimized') {
        return res.status(400).json({ ok: false, error: 'kdsNavView must be "full" or "minimized"' });
      }
      await dataClient.updateVendorKdsNavView(vendor.id, kdsNavView);
      return res.status(200).json({ ok: true, kdsNavView });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('KDS settings error:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
