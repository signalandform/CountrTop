import type { NextApiRequest, NextApiResponse } from 'next';
import { requireOpsAdminApi } from '../../../../../../lib/auth';
import { getServerDataClient } from '../../../../../../lib/dataClient';
import { isIncentiveMilestone } from '../../../../../../lib/milestones';

type ClaimResponse =
  | { success: true }
  | { success: false; error: string };

/**
 * PATCH /api/vendors/[slug]/milestones/[milestone]/claim
 * Mark an incentive milestone as claimed (ops admin only).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClaimResponse>
) {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authResult = await requireOpsAdminApi(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 401).json({
      success: false,
      error: authResult.error || 'Unauthorized'
    });
  }

  const slug = req.query.slug as string;
  const milestoneParam = req.query.milestone as string;

  if (!slug) {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  const milestone = parseInt(milestoneParam, 10);
  if (isNaN(milestone) || !isIncentiveMilestone(milestone)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid milestone. Only 500 (t-shirt) and 1000 (plaque) can be claimed.'
    });
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(slug);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    await dataClient.claimVendorOrderMilestone(vendor.id, milestone);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error claiming milestone:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
