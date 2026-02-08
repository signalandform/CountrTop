import type { NextApiRequest, NextApiResponse } from 'next';
import { requireVendorAdminApi } from '../../../../lib/auth';
import { createClient } from '@supabase/supabase-js';

import { type Database, invalidateVendorCacheBySlug } from '@countrtop/data';
import { getServerDataClient } from '../../../../lib/dataClient';
import { canUseCustomBranding } from '../../../../lib/planCapabilities';
import type { BillingPlanId } from '@countrtop/models';

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
    // Theming fields
    logoUrl,
    primaryColor,
    accentColor,
    fontFamily,
    reviewUrl
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

    // Fetch vendor row for ID and previous settings
    const { data: vendorRow, error: vendorError } = await supabase
      .from('vendors')
      .select('id, pickup_instructions')
      .eq('slug', vendorSlug)
      .maybeSingle();

    if (vendorError) {
      return res.status(500).json({
        success: false,
        error: `Failed to load vendor: ${vendorError.message}`
      });
    }

    if (!vendorRow) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const dataClient = getServerDataClient();
    const billing = await dataClient.getVendorBilling(vendorRow.id);
    const planId: BillingPlanId = (billing?.planId as BillingPlanId) ?? 'trial';
    const hasBrandingUpdate =
      logoUrl !== undefined ||
      primaryColor !== undefined ||
      accentColor !== undefined ||
      fontFamily !== undefined;
    if (hasBrandingUpdate && !canUseCustomBranding(planId)) {
      return res.status(403).json({
        success: false,
        error: 'Custom branding is not available on your plan. Upgrade to Starter or Pro.'
      });
    }

    const previousPickupInstructions = vendorRow.pickup_instructions ?? null;

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
    // Theming fields
    if (logoUrl !== undefined) updateData.logo_url = logoUrl || null;
    if (primaryColor !== undefined) updateData.primary_color = primaryColor || null;
    if (accentColor !== undefined) updateData.accent_color = accentColor || null;
    if (fontFamily !== undefined) updateData.font_family = fontFamily || null;
    if (reviewUrl !== undefined) updateData.review_url = reviewUrl ?? null;
    // Ensure reviewUrl is applied when present in body (handles any body parsing quirks)
    if (req.body && 'reviewUrl' in req.body) updateData.review_url = req.body.reviewUrl ?? null;

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

    invalidateVendorCacheBySlug(vendorSlug);

    // Keep location pickup instructions in sync when settings update the default.
    if (pickupInstructions !== undefined) {
      const normalizedPickupInstructions = pickupInstructions || null;
      const { data: locationRows, error: locationError } = await supabase
        .from('vendor_locations')
        .select('id, pickup_instructions')
        .eq('vendor_id', vendorRow.id);

      if (locationError) {
        return res.status(500).json({
          success: false,
          error: `Failed to load vendor locations: ${locationError.message}`
        });
      }

      const locationIdsToUpdate = (locationRows ?? [])
        .filter((loc) => loc.pickup_instructions == null || (loc.pickup_instructions ?? null) === previousPickupInstructions)
        .map((loc) => loc.id);

      if (locationIdsToUpdate.length > 0) {
        const { error: locationUpdateError } = await supabase
          .from('vendor_locations')
          .update({ pickup_instructions: normalizedPickupInstructions })
          .in('id', locationIdsToUpdate);

        if (locationUpdateError) {
          return res.status(500).json({
            success: false,
            error: `Failed to update vendor locations: ${locationUpdateError.message}`
          });
        }
      }
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

