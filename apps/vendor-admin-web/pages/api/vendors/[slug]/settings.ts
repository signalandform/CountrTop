import type { NextApiRequest, NextApiResponse } from 'next';
import { requireVendorAdminApi } from '../../../../lib/auth';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@countrtop/data';

type UpdateSettingsResponse = 
  | { success: true }
  | { success: false; error: string };

/**
 * API route to update vendor settings (address and pickup instructions).
 * 
 * PUT /api/vendors/[slug]/settings
 * Body: {
 *   addressLine1?: string | null;
 *   addressLine2?: string | null;
 *   city?: string | null;
 *   state?: string | null;
 *   postalCode?: string | null;
 *   phone?: string | null;
 *   pickupInstructions?: string | null;
 * }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateSettingsResponse>
) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slugParam = req.query.slug;
  const vendorSlug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!vendorSlug || typeof vendorSlug !== 'string') {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  // Authenticate as vendor admin
  const authResult = await requireVendorAdminApi(req, res, vendorSlug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 401).json({ 
      success: false, 
      error: authResult.error || 'Unauthorized' 
    });
  }

  const {
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    phone,
    pickupInstructions,
    kdsActiveLimitTotal,
    kdsActiveLimitCt,
    themePreference
  } = req.body;

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false
      }
    });

    // Build update object - only include provided fields
    const updateData: Partial<Database['public']['Tables']['vendors']['Update']> = {};

    if (addressLine1 !== undefined) updateData.address_line1 = addressLine1 || null;
    if (addressLine2 !== undefined) updateData.address_line2 = addressLine2 || null;
    if (city !== undefined) updateData.city = city || null;
    if (state !== undefined) updateData.state = state || null;
    if (postalCode !== undefined) updateData.postal_code = postalCode || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (pickupInstructions !== undefined) updateData.pickup_instructions = pickupInstructions || null;
    if (kdsActiveLimitTotal !== undefined) updateData.kds_active_limit_total = kdsActiveLimitTotal || null;
    if (kdsActiveLimitCt !== undefined) updateData.kds_active_limit_ct = kdsActiveLimitCt || null;
    if (themePreference !== undefined) {
      // Validate theme preference
      if (themePreference === 'light' || themePreference === 'dark') {
        updateData.theme_preference = themePreference;
      } else {
        updateData.theme_preference = null;
      }
    }

    // Do not allow updating square_location_id or admin_user_id through this endpoint
    // These are protected fields

    const { error: updateError } = await supabase
      .from('vendors')
      .update(updateData)
      .eq('slug', vendorSlug);

    if (updateError) {
      return res.status(500).json({ 
        success: false, 
        error: `Failed to update vendor: ${updateError.message}` 
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating vendor settings:', error);
    return res.status(500).json({ 
      success: false, 
      error: `Failed to update vendor settings: ${errorMessage}` 
    });
  }
}

