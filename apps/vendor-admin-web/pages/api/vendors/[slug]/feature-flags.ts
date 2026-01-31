import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../lib/auth';

type FeatureFlagsResponse =
  | { success: true; data: Record<string, boolean> }
  | { success: false; error: string };

type SetFeatureFlagRequest = {
  featureKey: string;
  enabled: boolean;
};

type SetFeatureFlagResponse =
  | { success: true }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/feature-flags
 * 
 * Returns all feature flags for the vendor.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FeatureFlagsResponse | SetFeatureFlagResponse>
) {
  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  // Authenticate as vendor admin
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

    if (req.method === 'GET') {
      // Get all feature flags
      const flags = await dataClient.getVendorFeatureFlags(vendor.id);
      return res.status(200).json({
        success: true,
        data: flags
      });
    } else if (req.method === 'PUT') {
      // Set a feature flag
      const { featureKey, enabled }: SetFeatureFlagRequest = req.body;

      if (!featureKey || typeof featureKey !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'featureKey is required'
        });
      }

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'enabled must be a boolean'
        });
      }

      await dataClient.setVendorFeatureFlag(vendor.id, featureKey, enabled);
      return res.status(200).json({
        success: true
      });
    } else {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error handling feature flags:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to handle feature flags: ${errorMessage}`
    });
  }
}

