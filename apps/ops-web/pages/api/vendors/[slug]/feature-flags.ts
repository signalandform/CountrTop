import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@countrtop/data';
import { requireOpsAdminApi } from '../../../../lib/auth';

type FeatureFlagsResponse =
  | { success: true; flags: Record<string, boolean> }
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
 * Get all feature flags for a vendor (ops admin only)
 * 
 * PUT /api/vendors/[slug]/feature-flags
 * Set a feature flag for a vendor (ops admin only)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FeatureFlagsResponse | SetFeatureFlagResponse>
) {
  // Check ops admin access
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
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false
      }
    });

    // Get vendor by slug
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id')
      .eq('slug', slug)
      .single();

    if (vendorError || !vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    if (req.method === 'GET') {
      // Get all feature flags for this vendor
      const { data: flags, error: flagsError } = await supabase
        .from('vendor_feature_flags')
        .select('feature_key, enabled')
        .eq('vendor_id', vendor.id);

      if (flagsError) {
        console.error('Error fetching feature flags:', flagsError);
        return res.status(500).json({
          success: false,
          error: `Failed to fetch feature flags: ${flagsError.message}`
        });
      }

      // Convert array to Record<string, boolean>
      const flagsMap: Record<string, boolean> = {};
      (flags || []).forEach(flag => {
        flagsMap[flag.feature_key] = flag.enabled;
      });

      return res.status(200).json({
        success: true,
        flags: flagsMap
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

      // Upsert the feature flag
      const { error: upsertError } = await supabase
        .from('vendor_feature_flags')
        .upsert(
          {
            vendor_id: vendor.id,
            feature_key: featureKey,
            enabled: enabled
          },
          { onConflict: 'vendor_id,feature_key' }
        );

      if (upsertError) {
        console.error('Error setting feature flag:', upsertError);
        return res.status(500).json({
          success: false,
          error: `Failed to set feature flag: ${upsertError.message}`
        });
      }

      return res.status(200).json({
        success: true
      });
    } else {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Unexpected error handling feature flags:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

