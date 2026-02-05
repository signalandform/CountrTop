import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';
import { MILESTONE_TIERS } from '../../../../../lib/milestones';

type SeenRequest = {
  milestone: number;
};

type SeenResponse =
  | { success: true }
  | { success: false; error: string };

/**
 * POST /api/vendors/[slug]/milestones/seen
 *
 * Marks a vendor order milestone as seen (dismisses the banner).
 * Auth: vendor admin for slug.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SeenResponse>
) {
  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  const authResult = await requireVendorAdminApi(req, res, slug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode ?? 401).json({
      success: false,
      error: authResult.error ?? 'Unauthorized'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { milestone } = req.body as SeenRequest;
  if (typeof milestone !== 'number' || milestone <= 0) {
    return res.status(400).json({ success: false, error: 'milestone must be a positive number' });
  }

  const tier = MILESTONE_TIERS.find((t) => t.milestone === milestone);
  if (!tier) {
    return res.status(400).json({ success: false, error: 'Invalid milestone' });
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    await dataClient.markVendorOrderMilestoneSeen(vendor.id, milestone, tier.milestoneType);
    return res.status(200).json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error marking milestone seen:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to mark milestone seen: ${errorMessage}`
    });
  }
}
