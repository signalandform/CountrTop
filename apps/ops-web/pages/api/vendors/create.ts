import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@countrtop/data';
import { createDataClient } from '@countrtop/data';
import { checkSquarePaymentsActivation } from '@countrtop/api-client/square';
import { requireOpsAdminApi } from '../../../lib/auth';

type CreateVendorRequest = {
  slug: string;
  display_name: string;
  pos_provider: 'square' | 'clover' | 'toast';
  square_location_id: string; // External POS location ID
  square_credential_ref?: string | null;
  status?: 'active' | 'inactive' | null;
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
};

type CreateVendorResponse =
  | { success: true; vendor: { id: string; slug: string } }
  | { success: false; error: string };

/**
 * POST /api/vendors/create
 * Create a new vendor (ops admin only)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateVendorResponse>
) {
  if (req.method !== 'POST') {
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

    const body: CreateVendorRequest = req.body;

    // Validate required fields
    if (!body.slug || !body.display_name || !body.square_location_id) {
      return res.status(400).json({
        success: false,
        error: 'slug, display_name, and location ID are required'
      });
    }

    // Validate POS provider
    const validProviders = ['square', 'clover', 'toast'];
    if (body.pos_provider && !validProviders.includes(body.pos_provider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid POS provider. Must be one of: square, clover, toast'
      });
    }

    // Validate slug format (alphanumeric, hyphens, underscores only)
    const slugRegex = /^[a-z0-9-_]+$/;
    if (!slugRegex.test(body.slug)) {
      return res.status(400).json({
        success: false,
        error: 'Slug must contain only lowercase letters, numbers, hyphens, and underscores'
      });
    }

    // Check if slug already exists
    const { data: existingVendor } = await supabase
      .from('vendors')
      .select('id')
      .eq('slug', body.slug)
      .single();

    if (existingVendor) {
      return res.status(400).json({
        success: false,
        error: 'A vendor with this slug already exists'
      });
    }

    // Check if square_location_id already exists
    const { data: existingLocation } = await supabase
      .from('vendors')
      .select('id')
      .eq('square_location_id', body.square_location_id)
      .single();

    if (existingLocation) {
      return res.status(400).json({
        success: false,
        error: 'A vendor with this Square Location ID already exists'
      });
    }

    // Generate vendor ID
    const vendorId = `vendor_${body.slug}_${Date.now()}`;

    // Insert new vendor
    const { data: vendor, error } = await supabase
      .from('vendors')
      .insert({
        id: vendorId,
        slug: body.slug,
        display_name: body.display_name,
        pos_provider: body.pos_provider || 'square',
        square_location_id: body.square_location_id,
        square_credential_ref: body.square_credential_ref || null,
        status: body.status || 'active',
        address_line1: body.address_line1 || null,
        address_line2: body.address_line2 || null,
        city: body.city || null,
        state: body.state || null,
        postal_code: body.postal_code || null,
        phone: body.phone || null,
        timezone: body.timezone || null,
        pickup_instructions: body.pickup_instructions || null,
        kds_active_limit_total: body.kds_active_limit_total || null,
        kds_active_limit_ct: body.kds_active_limit_ct || null
      })
      .select('id, slug')
      .single();

    if (error) {
      console.error('Error creating vendor:', error);
      return res.status(500).json({
        success: false,
        error: `Failed to create vendor: ${error.message}`
      });
    }

    // Populate vendor_billing with default plan so plan-gated features have a row
    const { error: billingError } = await supabase
      .from('vendor_billing')
      .insert({
        vendor_id: vendor.id,
        plan_id: 'beta'
      });

    if (billingError) {
      console.error('Error creating vendor billing:', billingError);
      return res.status(500).json({
        success: false,
        error: `Failed to create vendor billing: ${billingError.message}`
      });
    }

    // Run Square payments activation check (best-effort; do not fail vendor creation)
    if (body.pos_provider === 'square' && body.square_location_id && body.square_location_id !== 'SQUARE_LOCATION_DEMO') {
      try {
        const dataClient = createDataClient({ supabase });
        const vendorForCheck = await dataClient.getVendorById(vendor.id);
        if (vendorForCheck) {
          const result = await checkSquarePaymentsActivation(
            vendorForCheck,
            body.square_location_id
          );
          await dataClient.setSquarePaymentsActivationStatus(vendor.id, {
            activated: result.activated,
            checkedAt: new Date().toISOString(),
            error: result.error ?? null,
            locationId: body.square_location_id
          });
        }
      } catch (checkErr) {
        console.warn('Square payments activation check failed on vendor create:', checkErr);
      }
    }

    return res.status(201).json({
      success: true,
      vendor: {
        id: vendor.id,
        slug: vendor.slug
      }
    });
  } catch (error) {
    console.error('Unexpected error creating vendor:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

