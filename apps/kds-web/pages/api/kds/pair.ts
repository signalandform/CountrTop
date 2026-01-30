import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';

type PairRequest = {
  token: string;
};

type PairResponse =
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PairResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { token }: PairRequest = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase });

    const pairing = await dataClient.consumePairingToken(token);
    if (!pairing) {
      return res.status(401).json({ success: false, error: 'Token is invalid or expired' });
    }

    const vendor = await dataClient.getVendorById(pairing.vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const locationId = pairing.locationId ?? vendor.squareLocationId;
    if (!locationId) {
      return res.status(400).json({ success: false, error: 'Location is not configured for this vendor' });
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const sessionData = {
      vendorSlug: vendor.slug,
      locationId,
      vendorId: vendor.id,
      expiresAt: expiresAt.toISOString()
    };

    const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    return res.status(200).json({
      success: true,
      data: {
        sessionToken,
        vendorSlug: vendor.slug,
        locationId,
        vendorId: vendor.id,
        expiresAt: sessionData.expiresAt
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to pair device';
    return res.status(500).json({ success: false, error: message });
  }
}
