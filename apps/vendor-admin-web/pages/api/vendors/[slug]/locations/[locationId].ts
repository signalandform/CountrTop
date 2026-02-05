import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import type { VendorLocation } from '@countrtop/models';
import { requireVendorAdminApi } from '../../../../../lib/auth';

type LocationResponse =
  | { ok: true; location: VendorLocation }
  | { ok: true; deleted: true }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LocationResponse>
) {
  const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : null;
  
  if (!slug || !locationId) {
    return res.status(400).json({ ok: false, error: 'Vendor slug and location ID required' });
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

  // Get vendor and verify location belongs to vendor
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  const location = await dataClient.getVendorLocationById(locationId);
  if (!location || location.vendorId !== vendor.id) {
    return res.status(404).json({ ok: false, error: 'Location not found' });
  }

  try {
    // GET: Get single location
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, location });
    }

    // PUT/PATCH: Update location
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const {
        name,
        isPrimary,
        isActive,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        phone,
        timezone,
        pickupInstructions,
        onlineOrderingEnabled,
        kdsActiveLimitTotal,
        kdsActiveLimitCt,
        // New KDS settings
        kdsAutoBumpMinutes,
        kdsSoundAlertsEnabled,
        kdsDisplayMode,
        // Online ordering settings
        onlineOrderingLeadTimeMinutes,
        onlineOrderingHoursJson,
        scheduledOrdersEnabled,
        scheduledOrderLeadDays,
        scheduledOrderSlotMinutes,
      } = req.body;

      const updates: Parameters<typeof dataClient.updateVendorLocation>[1] = {};
      
      if (name !== undefined) updates.name = name;
      if (isPrimary !== undefined) updates.isPrimary = isPrimary;
      if (isActive !== undefined) updates.isActive = isActive;
      if (addressLine1 !== undefined) updates.addressLine1 = addressLine1;
      if (addressLine2 !== undefined) updates.addressLine2 = addressLine2;
      if (city !== undefined) updates.city = city;
      if (state !== undefined) updates.state = state;
      if (postalCode !== undefined) updates.postalCode = postalCode;
      if (phone !== undefined) updates.phone = phone;
      if (timezone !== undefined) updates.timezone = timezone;
      if (pickupInstructions !== undefined) updates.pickupInstructions = pickupInstructions;
      if (onlineOrderingEnabled !== undefined) {
        if (onlineOrderingEnabled === true) {
          const paymentsStatus = await dataClient.getSquarePaymentsActivationStatus(vendor.id);
          if (paymentsStatus?.activated === false) {
            return res.status(400).json({
              ok: false,
              error: 'Square payments must be activated before enabling online ordering. Complete activation in the Square Dashboard, then use Re-check Square Activation on the Dashboard.'
            });
          }
        }
        updates.onlineOrderingEnabled = onlineOrderingEnabled;
      }
      if (kdsActiveLimitTotal !== undefined) updates.kdsActiveLimitTotal = kdsActiveLimitTotal;
      if (kdsActiveLimitCt !== undefined) updates.kdsActiveLimitCt = kdsActiveLimitCt;
      // New KDS settings
      if (kdsAutoBumpMinutes !== undefined) updates.kdsAutoBumpMinutes = kdsAutoBumpMinutes;
      if (kdsSoundAlertsEnabled !== undefined) updates.kdsSoundAlertsEnabled = kdsSoundAlertsEnabled;
      if (kdsDisplayMode !== undefined) updates.kdsDisplayMode = kdsDisplayMode;
      // Online ordering settings  
      if (onlineOrderingLeadTimeMinutes !== undefined) updates.onlineOrderingLeadTimeMinutes = onlineOrderingLeadTimeMinutes;
      if (onlineOrderingHoursJson !== undefined) updates.onlineOrderingHoursJson = onlineOrderingHoursJson ?? null;
      if (scheduledOrdersEnabled !== undefined) updates.scheduledOrdersEnabled = scheduledOrdersEnabled;
      if (scheduledOrderLeadDays !== undefined) updates.scheduledOrderLeadDays = scheduledOrderLeadDays;
      if (scheduledOrderSlotMinutes !== undefined) updates.scheduledOrderSlotMinutes = scheduledOrderSlotMinutes;

      const updatedLocation = await dataClient.updateVendorLocation(locationId, updates);
      return res.status(200).json({ ok: true, location: updatedLocation });
    }

    // DELETE: Remove location
    if (req.method === 'DELETE') {
      // Don't allow deleting the primary location
      if (location.isPrimary) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Cannot delete primary location. Set another location as primary first.' 
        });
      }

      await dataClient.deleteVendorLocation(locationId);
      return res.status(200).json({ ok: true, deleted: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Location API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ ok: false, error: message });
  }
}

