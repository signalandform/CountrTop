import type { NextApiRequest, NextApiResponse } from 'next';
import { requireVendorAdminApi } from '../../../../lib/auth';
import { getServerDataClient } from '../../../../lib/dataClient';
import { squareClientForVendor } from '@countrtop/api-client';

type LocationPinInfo = {
  locationId: string;
  locationName: string;
  hasPin: boolean;
};

type LocationPinsResponse =
  | { success: true; data: LocationPinInfo[] }
  | { success: false; error: string };

type SetLocationPinRequest = {
  locationId: string;
  pin: string;
};

type SetLocationPinResponse =
  | { success: true }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/location-pins
 * 
 * Returns all Square locations for the vendor with their PIN status.
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<LocationPinsResponse>,
  vendorSlug: string
) {
  try {
    const authResult = await requireVendorAdminApi(req, res, vendorSlug);
    if (!authResult.authorized) {
      return res.status(authResult.statusCode || 403).json({
        success: false,
        error: authResult.error || 'Unauthorized'
      });
    }

    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(vendorSlug);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    // Get Square locations
    let locations: Array<{ id: string; name: string }> = [];
    try {
      // Debug: Check if token is available (don't log the actual token)
      const hasToken = !!process.env.SQUARE_ACCESS_TOKEN || 
        (vendor.squareCredentialRef && !!process.env[`SQUARE_ACCESS_TOKEN_${vendor.squareCredentialRef.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`]);
      console.log('Square token check:', { 
        hasToken, 
        hasSquareCredentialRef: !!vendor.squareCredentialRef,
        squareEnvironment: process.env.SQUARE_ENVIRONMENT || 'sandbox'
      });

      const square = squareClientForVendor(vendor);
      const { result } = await square.locationsApi.listLocations();
      
      if (result.errors && result.errors.length > 0) {
        console.error('Square API errors:', result.errors);
        // Return empty list if Square API has errors
        return res.status(200).json({ success: true, data: [] });
      }
      
      if (result.locations) {
        locations = result.locations
          .filter(loc => loc.id)
          .map(loc => ({
            id: loc.id || '',
            name: loc.name || 'Unnamed Location'
          }));
      }
    } catch (error) {
      // If Square token is not configured, return empty list
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error fetching Square locations:', {
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        vendorId: vendor.id,
        vendorSlug: vendor.slug,
        squareCredentialRef: vendor.squareCredentialRef
      });
      
      if (errorMessage.includes('Square access token not configured')) {
        return res.status(200).json({ success: true, data: [] });
      }
      
      // For other errors, still return empty list but log the error
      return res.status(200).json({ success: true, data: [] });
    }

    // Get PIN status for all locations
    const locationPins = await dataClient.getLocationPins(vendor.id);

    const locationPinInfo: LocationPinInfo[] = locations.map(loc => ({
      locationId: loc.id,
      locationName: loc.name,
      hasPin: locationPins[loc.id] === true
    }));

    return res.status(200).json({ success: true, data: locationPinInfo });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching location PINs:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch location PINs: ${errorMessage}`
    });
  }
}

/**
 * PUT /api/vendors/[slug]/location-pins
 * 
 * Sets or updates a PIN for a location.
 */
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse<SetLocationPinResponse>,
  vendorSlug: string
) {
  try {
    const authResult = await requireVendorAdminApi(req, res, vendorSlug);
    if (!authResult.authorized) {
      return res.status(authResult.statusCode || 403).json({
        success: false,
        error: authResult.error || 'Unauthorized'
      });
    }

    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(vendorSlug);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const { locationId, pin }: SetLocationPinRequest = req.body;

    if (!locationId || !pin) {
      return res.status(400).json({
        success: false,
        error: 'locationId and pin are required'
      });
    }

    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        error: 'PIN must be exactly 4 digits'
      });
    }

    await dataClient.setLocationPin(vendor.id, locationId, pin);

    return res.status(200).json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error setting location PIN:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to set location PIN: ${errorMessage}`
    });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LocationPinsResponse | SetLocationPinResponse>
) {
  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, slug);
  } else if (req.method === 'PUT') {
    return handlePut(req, res, slug);
  } else {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}

