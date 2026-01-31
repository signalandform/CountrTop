import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../lib/auth';
import { canUseLoyalty } from '../../../../lib/planCapabilities';
import type { BillingPlanId } from '@countrtop/models';

type LoyaltySettingsResponse =
  | { success: true; data: { centsPerPoint: number; minPointsToRedeem: number; maxPointsPerOrder: number } }
  | { success: false; error: string };

type PutLoyaltySettingsRequest = {
  centsPerPoint: number;
  minPointsToRedeem: number;
  maxPointsPerOrder: number;
};

/**
 * GET /api/vendors/[slug]/loyalty-settings
 * Returns loyalty redemption settings for the vendor (defaults when no row).
 *
 * PUT /api/vendors/[slug]/loyalty-settings
 * Updates loyalty redemption settings.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LoyaltySettingsResponse>
) {
  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  const authResult = await requireVendorAdminApi(req, res, slug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 401).json({
      success: false,
      error: authResult.error || 'Unauthorized'
    });
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(slug);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const billing = await dataClient.getVendorBilling(vendor.id);
    const planId: BillingPlanId = (billing?.planId as BillingPlanId) ?? 'beta';
    if (!canUseLoyalty(planId)) {
      return res.status(403).json({
        success: false,
        error: 'Loyalty program is not available on your plan. Upgrade to Starter or Pro.'
      });
    }

    if (req.method === 'GET') {
      const settings = await dataClient.getVendorLoyaltySettings(vendor.id);
      return res.status(200).json({
        success: true,
        data: {
          centsPerPoint: settings.centsPerPoint,
          minPointsToRedeem: settings.minPointsToRedeem,
          maxPointsPerOrder: settings.maxPointsPerOrder
        }
      });
    }

    if (req.method === 'PUT') {
      const body = req.body as PutLoyaltySettingsRequest;
      const centsPerPoint = Number(body?.centsPerPoint);
      const minPointsToRedeem = Number(body?.minPointsToRedeem);
      const maxPointsPerOrder = Number(body?.maxPointsPerOrder);

      if (Number.isNaN(centsPerPoint) || centsPerPoint < 0) {
        return res.status(400).json({ success: false, error: 'centsPerPoint must be a non-negative number' });
      }
      if (Number.isNaN(minPointsToRedeem) || minPointsToRedeem < 0) {
        return res.status(400).json({ success: false, error: 'minPointsToRedeem must be a non-negative number' });
      }
      if (Number.isNaN(maxPointsPerOrder) || maxPointsPerOrder < 0) {
        return res.status(400).json({ success: false, error: 'maxPointsPerOrder must be a non-negative number' });
      }
      if (minPointsToRedeem > maxPointsPerOrder) {
        return res.status(400).json({
          success: false,
          error: 'minPointsToRedeem cannot exceed maxPointsPerOrder'
        });
      }

      await dataClient.setVendorLoyaltySettings(vendor.id, {
        centsPerPoint,
        minPointsToRedeem,
        maxPointsPerOrder
      });
      return res.status(200).json({
        success: true,
        data: { centsPerPoint, minPointsToRedeem, maxPointsPerOrder }
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error handling loyalty settings:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to handle loyalty settings: ${errorMessage}`
    });
  }
}
