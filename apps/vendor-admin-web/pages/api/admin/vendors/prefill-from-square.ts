import type { NextApiRequest, NextApiResponse } from 'next';
import { getSquareLocation } from '@countrtop/api-client';
import { getServerDataClient } from '../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../lib/auth';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@countrtop/data';

type PrefillResponse = 
  | { success: true; updated: string[]; skipped: string[] }
  | { success: false; error: string };

/**
 * Admin-only API route to prefill vendor address fields from Square location data.
 * 
 * POST /api/admin/vendors/prefill-from-square
 * Body: { vendorSlug: string, squareLocationId?: string, force?: boolean }
 * 
 * - Fetches Square location data by location ID
 * - Updates vendor row with address fields (only if empty unless force=true)
 * - Requires vendor admin authentication
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PrefillResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { vendorSlug, squareLocationId, force = false } = req.body;

  if (!vendorSlug || typeof vendorSlug !== 'string') {
    return res.status(400).json({ success: false, error: 'vendorSlug is required' });
  }

  // Authenticate as vendor admin
  const authResult = await requireVendorAdminApi(req, res, vendorSlug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 401).json({ 
      success: false, 
      error: authResult.error || 'Unauthorized' 
    });
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(vendorSlug);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    // Use provided locationId or vendor's existing squareLocationId
    const locationId = squareLocationId || vendor.squareLocationId;
    if (!locationId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Square location ID is required (provide in body or ensure vendor has squareLocationId)' 
      });
    }

    // Fetch Square location data
    const locationData = await getSquareLocation(vendor, locationId);

    // Prepare update object - only include fields that should be updated
    const updateData: Partial<Database['public']['Tables']['vendors']['Update']> = {};
    const updated: string[] = [];
    const skipped: string[] = [];

    // Check each field and only update if empty or force=true
    if (locationData.name && (!vendor.displayName || force)) {
      updateData.display_name = locationData.name;
      updated.push('display_name');
    } else if (locationData.name) {
      skipped.push('display_name (already set)');
    }

    if (locationData.addressLine1 && (!vendor.addressLine1 || force)) {
      updateData.address_line1 = locationData.addressLine1;
      updated.push('address_line1');
    } else if (locationData.addressLine1) {
      skipped.push('address_line1 (already set)');
    }

    if (locationData.addressLine2 && (!vendor.addressLine2 || force)) {
      updateData.address_line2 = locationData.addressLine2;
      updated.push('address_line2');
    } else if (locationData.addressLine2) {
      skipped.push('address_line2 (already set)');
    }

    if (locationData.city && (!vendor.city || force)) {
      updateData.city = locationData.city;
      updated.push('city');
    } else if (locationData.city) {
      skipped.push('city (already set)');
    }

    if (locationData.state && (!vendor.state || force)) {
      updateData.state = locationData.state;
      updated.push('state');
    } else if (locationData.state) {
      skipped.push('state (already set)');
    }

    if (locationData.postalCode && (!vendor.postalCode || force)) {
      updateData.postal_code = locationData.postalCode;
      updated.push('postal_code');
    } else if (locationData.postalCode) {
      skipped.push('postal_code (already set)');
    }

    if (locationData.phone && (!vendor.phone || force)) {
      updateData.phone = locationData.phone;
      updated.push('phone');
    } else if (locationData.phone) {
      skipped.push('phone (already set)');
    }

    if (locationData.timezone && (!vendor.timezone || force)) {
      updateData.timezone = locationData.timezone;
      updated.push('timezone');
    } else if (locationData.timezone) {
      skipped.push('timezone (already set)');
    }

    // Only update if there are fields to update
    if (Object.keys(updateData).length > 0) {
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
    }

    return res.status(200).json({
      success: true,
      updated,
      skipped
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error prefilling vendor from Square:', error);
    return res.status(500).json({ 
      success: false, 
      error: `Failed to prefill vendor: ${errorMessage}` 
    });
  }
}

