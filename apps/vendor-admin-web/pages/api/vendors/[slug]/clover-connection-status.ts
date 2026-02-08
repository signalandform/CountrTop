import type { NextApiRequest, NextApiResponse } from 'next';
import { requireVendorAdminApi } from '../../../../lib/auth';
import { getServerDataClient } from '../../../../lib/dataClient';

const normalizeSlug = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type CloverStatusResponse = {
  success: boolean;
  data?: { connected: boolean };
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CloverStatusResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slug = normalizeSlug(req.query.slug);
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'Vendor slug required' });
  }

  const authResult = await requireVendorAdminApi(req, res, slug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode ?? 401).json({
      success: false,
      error: authResult.error ?? 'Unauthorized'
    });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ success: false, error: 'Vendor not found' });
  }

  const env = (process.env.CLOVER_ENVIRONMENT ?? 'sandbox').toLowerCase() as 'sandbox' | 'production';
  const integration = await dataClient.getVendorCloverIntegration(vendor.id, env);
  const connected = !!(integration && integration.accessToken && integration.connectionStatus === 'connected');

  return res.status(200).json({ success: true, data: { connected } });
}
