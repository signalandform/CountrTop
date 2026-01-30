import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { requireVendorAdminApi } from '../../../../lib/auth';
import { getServerDataClient } from '../../../../lib/dataClient';

type PairingTokenListItem = {
  id: string;
  locationId?: string | null;
  expiresAt: string;
  createdAt: string;
};

type PairingTokensResponse =
  | { success: true; data: PairingTokenListItem[] }
  | { success: false; error: string };

type CreatePairingTokenResponse =
  | { success: true; data: { token: string; tokenId: string; createdAt: string; expiresAt: string; locationId?: string | null } }
  | { success: false; error: string };

type DeletePairingTokenResponse =
  | { success: true }
  | { success: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PairingTokensResponse | CreatePairingTokenResponse | DeletePairingTokenResponse>
) {
  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  if (!slug) {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  const authResult = await requireVendorAdminApi(req, res, slug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 403).json({
      success: false,
      error: authResult.error || 'Unauthorized'
    });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ success: false, error: 'Vendor not found' });
  }

  if (req.method === 'GET') {
    try {
      const tokens = await dataClient.listPairingTokens(vendor.id);
      return res.status(200).json({
        success: true,
        data: tokens.map((token) => ({
          id: token.id,
          locationId: token.locationId ?? null,
          expiresAt: token.expiresAt,
          createdAt: token.createdAt
        }))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load tokens';
      return res.status(500).json({ success: false, error: message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { locationId, expiresInMinutes } = req.body as { locationId?: string | null; expiresInMinutes?: number };
      const result = await dataClient.createPairingToken(vendor.id, locationId ?? null, expiresInMinutes);
      return res.status(200).json({
        success: true,
        data: {
          token: result.token,
          tokenId: result.tokenId,
          createdAt: result.createdAt,
          expiresAt: result.expiresAt,
          locationId: result.locationId ?? null
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create token';
      return res.status(500).json({ success: false, error: message });
    }
  }

  if (req.method === 'DELETE') {
    const tokenId = typeof req.query.tokenId === 'string' ? req.query.tokenId : null;
    if (!tokenId) {
      return res.status(400).json({ success: false, error: 'tokenId is required' });
    }
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ success: false, error: 'Server configuration error' });
      }
      const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
      });
      const { error } = await supabase
        .from('kds_pairing_tokens')
        .delete()
        .eq('id', tokenId)
        .eq('vendor_id', vendor.id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revoke token';
      return res.status(500).json({ success: false, error: message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
