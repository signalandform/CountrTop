import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import type { VendorLocation } from '@countrtop/models';
import { requireVendorAdminApi } from '../../../../lib/auth';
import { canUseMultipleLocations } from '../../../../lib/planCapabilities';
import type { BillingPlanId } from '@countrtop/models';

type LocationsResponse =
  | { ok: true; locations: VendorLocation[] }
  | { ok: true; location: VendorLocation }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LocationsResponse>
) {
  const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  // Verify vendor admin access
  const authResult = await requireVendorAdminApi(req, res, slug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 401).json({
      ok: false,
      error: authResult.error || 'Unauthorized'
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
  const dataClient = createDataClient({ supabase });

  // Get vendor
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  try {
    // GET: List all locations for vendor
    if (req.method === 'GET') {
      const includeInactive = req.query.includeInactive === 'true';
      const locations = await dataClient.listVendorLocations(vendor.id, includeInactive);
      return res.status(200).json({ ok: true, locations });
    }

    // POST: Create a new location
    if (req.method === 'POST') {
      const billing = await dataClient.getVendorBilling(vendor.id);
      const planId: BillingPlanId = (billing?.planId as BillingPlanId) ?? 'beta';
      const existingLocations = await dataClient.listVendorLocations(vendor.id, true);
      if (existingLocations.length >= 1 && !canUseMultipleLocations(planId)) {
        return res.status(403).json({
          ok: false,
          error: 'Multiple locations require the Pro plan. Upgrade to add more locations.'
        });
      }

      const { 
        squareLocationId, 
        name, 
        isPrimary = false,
        isActive = true,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        phone,
        timezone,
        pickupInstructions,
        onlineOrderingEnabled = true,
        kdsActiveLimitTotal,
        kdsActiveLimitCt
      } = req.body;

      if (!squareLocationId || !name) {
        return res.status(400).json({ 
          ok: false, 
          error: 'squareLocationId and name are required' 
        });
      }

      const location = await dataClient.createVendorLocation({
        vendorId: vendor.id,
        externalLocationId: squareLocationId, // POS-agnostic field
        squareLocationId, // Deprecated alias
        posProvider: 'square', // Default to Square for now
        name,
        isPrimary,
        isActive,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        city: city || null,
        state: state || null,
        postalCode: postalCode || null,
        phone: phone || null,
        timezone: timezone || 'America/New_York',
        pickupInstructions: pickupInstructions || null,
        onlineOrderingEnabled,
        kdsActiveLimitTotal: kdsActiveLimitTotal || 10,
        kdsActiveLimitCt: kdsActiveLimitCt || 10
      });

      return res.status(201).json({ ok: true, location });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Locations API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ ok: false, error: message });
  }
}

