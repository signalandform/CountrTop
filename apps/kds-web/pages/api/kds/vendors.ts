import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';

type VendorListItem = {
  slug: string;
  displayName: string;
  squareLocationId: string;
};

type VendorsResponse =
  | { success: true; data: VendorListItem[] }
  | { success: false; error: string };

/**
 * GET /api/kds/vendors
 * 
 * Returns public vendor list for KDS vendor selection.
 * No authentication required (public endpoint).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VendorsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
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

    // Fetch all active vendors (public data only)
    const { data: vendors, error } = await supabase
      .from('vendors')
      .select('slug, display_name, square_location_id')
      .eq('status', 'active')
      .order('display_name');

    if (error) {
      console.error('Error fetching vendors:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch vendors'
      });
    }

    const vendorList: VendorListItem[] = (vendors || []).map(v => ({
      slug: v.slug,
      displayName: v.display_name,
      squareLocationId: v.square_location_id
    }));

    return res.status(200).json({
      success: true,
      data: vendorList
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in /api/kds/vendors:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch vendors: ${errorMessage}`
    });
  }
}

