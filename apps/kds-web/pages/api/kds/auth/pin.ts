import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import crypto from 'crypto';

type PinAuthRequest = {
  vendorSlug: string;
  locationId: string;
  pin: string;
};

type PinAuthResponse =
  | {
      success: true;
      data: {
        sessionToken: string;
        vendorSlug: string;
        locationId: string;
        vendorId: string;
        expiresAt: string;
      };
    }
  | { success: false; error: string };

/**
 * Hash a PIN using SHA-256 (simple hashing for v1)
 * Note: For production, consider using bcrypt for better security
 */
function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

/**
 * POST /api/kds/auth/pin
 * 
 * Authenticates using vendor slug, location ID, and 4-digit PIN.
 * Returns session token for KDS access.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PinAuthResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { vendorSlug, locationId, pin }: PinAuthRequest = req.body;

    if (!vendorSlug || !locationId || !pin) {
      return res.status(400).json({
        success: false,
        error: 'vendorSlug, locationId, and pin are required'
      });
    }

    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        error: 'PIN must be exactly 4 digits'
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    // Get vendor
    const dataClient = createDataClient({ supabase });
    const vendor = await dataClient.getVendorBySlug(vendorSlug);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    // Hash provided PIN
    const pinHash = hashPin(pin);

    // Lookup PIN in database
    const { data: pinRecord, error: pinError } = await supabase
      .from('vendor_location_pins')
      .select('id, vendor_id, location_id')
      .eq('vendor_id', vendor.id)
      .eq('location_id', locationId)
      .eq('pin_hash', pinHash)
      .maybeSingle();

    if (pinError) {
      console.error('Error looking up PIN:', pinError);
      return res.status(500).json({
        success: false,
        error: 'Failed to verify PIN'
      });
    }

    if (!pinRecord) {
      return res.status(401).json({
        success: false,
        error: 'Invalid PIN'
      });
    }

    // Create session token (simple JWT-like structure)
    // In production, use proper JWT library
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

    const sessionData = {
      vendorSlug,
      locationId,
      vendorId: vendor.id,
      expiresAt: expiresAt.toISOString()
    };

    // Simple base64 encoding (not secure, but works for v1)
    // In production, use proper JWT signing
    const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    return res.status(200).json({
      success: true,
      data: {
        sessionToken,
        vendorSlug,
        locationId,
        vendorId: vendor.id,
        expiresAt: expiresAt.toISOString()
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in PIN auth:', error);
    return res.status(500).json({
      success: false,
      error: `Authentication failed: ${errorMessage}`
    });
  }
}

