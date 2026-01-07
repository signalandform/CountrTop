import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@countrtop/data';
import { requireOpsAdminApi } from '../../lib/auth';

type VendorRow = {
  id: string;
  slug: string;
  display_name: string;
  pos_provider: 'square' | 'clover' | 'toast';
  square_location_id: string; // External POS location ID
  square_credential_ref?: string | null;
  status?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  timezone?: string | null;
  pickup_instructions?: string | null;
  admin_user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type VendorsResponse =
  | { success: true; vendors: VendorRow[] }
  | { success: false; error: string };

/**
 * GET /api/vendors
 * List all vendors (ops admin only)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VendorsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Check ops admin access
  const authResult = await requireOpsAdminApi(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 401).json({
      success: false,
      error: authResult.error || 'Unauthorized'
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

    const { data: vendors, error } = await supabase
      .from('vendors')
      .select('*')
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Error fetching vendors:', error);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch vendors: ${error.message}`
      });
    }

    return res.status(200).json({
      success: true,
      vendors: (vendors || []) as VendorRow[]
    });
  } catch (error) {
    console.error('Unexpected error fetching vendors:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

