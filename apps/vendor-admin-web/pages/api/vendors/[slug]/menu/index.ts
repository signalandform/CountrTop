import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { fetchMenuForVendor, type MenuItemWithAvailability } from '../../../../../lib/fetchMenu';
import { requireVendorAdminApi } from '../../../../../lib/auth';

type MenuGetResponse =
  | { success: true; items: MenuItemWithAvailability[] }
  | { success: false; error: string };

type MenuPatchBody = {
  catalogItemId: string;
  variationId: string;
  available?: boolean;
  internalStockCount?: number | null;
};

type MenuPatchResponse =
  | { success: true }
  | { success: false; error: string };

function normalizeSlug(value: string | string[] | undefined): string | null {
  const s = Array.isArray(value) ? value[0] : value;
  return typeof s === 'string' && s ? s : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MenuGetResponse | MenuPatchResponse>
) {
  const slug = normalizeSlug(req.query.slug);
  if (!slug) {
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

  if (req.method === 'GET') {
    const result = await fetchMenuForVendor(vendor, dataClient);
    if (!result.success) {
      return res.status(result.error.includes('not connected') || result.error.includes('unavailable') ? 503 : 500).json({
        success: false,
        error: result.error
      });
    }
    return res.status(200).json({ success: true, items: result.items });
  }

  if (req.method === 'PATCH') {
    let body: MenuPatchBody;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON body' });
    }
    const { catalogItemId, variationId, available, internalStockCount } = body;
    if (!catalogItemId || typeof catalogItemId !== 'string') {
      return res.status(400).json({ success: false, error: 'catalogItemId is required' });
    }
    if (!variationId || typeof variationId !== 'string') {
      return res.status(400).json({ success: false, error: 'variationId is required' });
    }

    try {
      await dataClient.upsertMenuItemAvailability(vendor.id, catalogItemId, variationId, {
        available,
        internalStockCount
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update menu item';
      return res.status(500).json({ success: false, error: message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
