import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';

type LocationItem = {
  id: string;
  name: string;
  isPrimary: boolean;
  address?: string;
};

type LocationsResponse =
  | { success: true; data: LocationItem[] }
  | { success: false; error: string };

/**
 * GET /api/kds/vendors/[slug]/locations
 * 
 * Returns active locations for a vendor from vendor_locations table.
 * No authentication required (public, but scoped to vendor).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LocationsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
    }
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase });
    const vendor = await dataClient.getVendorBySlug(slug);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    // Fetch active locations from vendor_locations table
    const { data: locationRows, error: locError } = await supabase
      .from('vendor_locations')
      .select('square_location_id, name, is_primary, address_line1, city, state')
      .eq('vendor_id', vendor.id)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('name', { ascending: true });

    if (locError) {
      console.error('Error fetching locations:', locError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch locations'
      });
    }

    // If no locations in the table, fall back to primary vendor location
    if (!locationRows || locationRows.length === 0) {
      // Return vendor's primary Square location as fallback
      return res.status(200).json({
        success: true,
        data: [{
          id: vendor.squareLocationId,
          name: vendor.displayName,
          isPrimary: true,
          address: [vendor.addressLine1, vendor.city, vendor.state].filter(Boolean).join(', ')
        }]
      });
    }

    const locations: LocationItem[] = locationRows.map(loc => ({
      id: loc.square_location_id,
      name: loc.name,
      isPrimary: loc.is_primary,
      address: [loc.address_line1, loc.city, loc.state].filter(Boolean).join(', ')
    }));

    return res.status(200).json({
      success: true,
      data: locations
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching locations:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch locations: ${errorMessage}`
    });
  }
}

