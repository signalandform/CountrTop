import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import { squareClientForVendor } from '@countrtop/api-client';

type LocationItem = {
  id: string;
  name: string;
};

type LocationsResponse =
  | { success: true; data: LocationItem[] }
  | { success: false; error: string };

/**
 * GET /api/kds/vendors/[slug]/locations
 * 
 * Returns Square locations for a vendor.
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

    // Get Square client for vendor
    const square = squareClientForVendor(vendor);

    // List all locations
    const { result } = await square.locationsApi.listLocations();

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map(e => e.detail || e.code).join(', ');
      return res.status(500).json({
        success: false,
        error: `Square API error: ${errorMessages}`
      });
    }

    const locations: LocationItem[] = (result.locations || []).map(loc => ({
      id: loc.id || '',
      name: loc.name || 'Unnamed Location'
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

