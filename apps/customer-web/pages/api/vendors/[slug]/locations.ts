import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';

type LocationItem = {
  id: string;
  squareLocationId: string;
  name: string;
  isPrimary: boolean;
  address?: string;
  pickupInstructions?: string | null;
};

type LocationsResponse =
  | { ok: true; locations: LocationItem[] }
  | { ok: false; error: string };

/**
 * GET /api/vendors/[slug]/locations
 * 
 * Returns active locations with online ordering enabled for a vendor.
 * Public endpoint for customer location selection.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LocationsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase });

    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor) {
      return res.status(404).json({ ok: false, error: 'Vendor not found' });
    }

    // Fetch active locations with online ordering enabled
    const { data: locationRows, error: locError } = await supabase
      .from('vendor_locations')
      .select('id, square_location_id, name, is_primary, address_line1, city, state, pickup_instructions')
      .eq('vendor_id', vendor.id)
      .eq('is_active', true)
      .eq('online_ordering_enabled', true)
      .order('is_primary', { ascending: false })
      .order('name', { ascending: true });

    if (locError) {
      console.error('Error fetching locations:', locError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch locations' });
    }

    // If no locations found, return vendor's primary location as fallback
    if (!locationRows || locationRows.length === 0) {
      return res.status(200).json({
        ok: true,
        locations: [{
          id: vendor.id,
          squareLocationId: vendor.squareLocationId,
          name: vendor.displayName,
          isPrimary: true,
          address: [vendor.addressLine1, vendor.city, vendor.state].filter(Boolean).join(', '),
          pickupInstructions: vendor.pickupInstructions
        }]
      });
    }

    const locations: LocationItem[] = locationRows.map(loc => ({
      id: loc.id,
      squareLocationId: loc.square_location_id,
      name: loc.name,
      isPrimary: loc.is_primary,
      address: [loc.address_line1, loc.city, loc.state].filter(Boolean).join(', '),
      pickupInstructions: loc.pickup_instructions
    }));

    return res.status(200).json({
      ok: true,
      locations
    });
  } catch (error) {
    console.error('Error in locations API:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ ok: false, error: message });
  }
}

