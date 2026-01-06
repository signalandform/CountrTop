import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@countrtop/data';
import { requireOpsAdminApi } from '../../../lib/auth';

type VendorRow = {
  id: string;
  slug: string;
  display_name: string;
  square_location_id: string;
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
  kds_active_limit_total?: number | null;
  kds_active_limit_ct?: number | null;
  admin_user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type VendorResponse =
  | { success: true; vendor: VendorRow }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]
 * Get vendor details by slug (ops admin only)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VendorResponse>
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

    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Vendor not found'
        });
      }
      console.error('Error fetching vendor:', error);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch vendor: ${error.message}`
      });
    }

    return res.status(200).json({
      success: true,
      vendor: vendor as VendorRow
    });
  } catch (error) {
    console.error('Unexpected error fetching vendor:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

