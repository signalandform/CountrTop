import type { NextApiRequest, NextApiResponse } from 'next';
import { requireOpsAdminApi } from '../../../../lib/auth';
import { getServerDataClient } from '../../../../lib/dataClient';
import { isIncentiveMilestone } from '../../../../lib/milestones';

type MilestoneRow = {
  id: string;
  vendorId: string;
  milestone: number;
  milestoneType: string;
  seenAt: string;
  claimedAt: string | null;
};

type MilestonesResponse =
  | { success: true; milestones: MilestoneRow[] }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/milestones
 * List vendor order milestones (ops admin only).
 * Returns incentive milestones (500, 1000) for fulfillment tracking.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MilestonesResponse>
) {
  if (req.method !== 'GET') {
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
  if (!slug) {
    return res.status(400).json({
      success: false,
      error: 'Vendor slug is required'
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

    const all = await dataClient.listVendorOrderMilestones(vendor.id);
    const incentive = all
      .filter((m) => isIncentiveMilestone(m.milestone))
      .map((m) => ({
        id: m.id,
        vendorId: m.vendorId,
        milestone: m.milestone,
        milestoneType: m.milestoneType,
        seenAt: m.seenAt,
        claimedAt: m.claimedAt
      }));

    return res.status(200).json({
      success: true,
      milestones: incentive
    });
  } catch (error) {
    console.error('Error fetching milestones:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
