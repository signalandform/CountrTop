/**
 * Square payments activation status and re-check.
 *
 * GET: Returns current readiness status (Square Connected, Location Selected, Menu Synced, Payments Activated).
 * POST: Re-runs the Square payments activation check and returns updated status.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireVendorAdminApi } from '../../../../lib/auth';
import { getServerDataClient } from '../../../../lib/dataClient';
import { checkSquarePaymentsActivation } from '@countrtop/api-client/square';
import { createLogger } from '@countrtop/api-client';

const logger = createLogger({ requestId: 'square-payments-status' });

type SquareStatusResponse = {
  success: boolean;
  data?: {
    squareConnected: boolean;
    locationSelected: boolean;
    menuSynced: boolean;
    paymentsActivated: boolean | null;
    paymentsCheckedAt: string | null;
    paymentsError: string | null;
    paymentsLocationId: string | null;
  };
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SquareStatusResponse>
) {
  const slugParam = req.query.slug;
  const vendorSlug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!vendorSlug || typeof vendorSlug !== 'string') {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  const authResult = await requireVendorAdminApi(req, res, vendorSlug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 401).json({
      success: false,
      error: authResult.error || 'Unauthorized'
    });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(vendorSlug);
  if (!vendor) {
    return res.status(404).json({ success: false, error: 'Vendor not found' });
  }

  const locations = await dataClient.listVendorLocations(vendor.id);
  const squareConnected = !!(vendor.squareLocationId && vendor.squareLocationId !== 'SQUARE_LOCATION_DEMO');
  const locationSelected = locations.length > 0;
  const menuSynced = locationSelected; // Menu comes from Square; having locations implies setup

  const buildResponse = async () => {
    const status = await dataClient.getSquarePaymentsActivationStatus(vendor.id);
    return {
      squareConnected,
      locationSelected,
      menuSynced,
      paymentsActivated: status?.activated ?? null,
      paymentsCheckedAt: status?.checkedAt ?? null,
      paymentsError: status?.error ?? null,
      paymentsLocationId: status?.locationId ?? null
    };
  };

  if (req.method === 'GET') {
    try {
      const data = await buildResponse();
      return res.status(200).json({ success: true, data });
    } catch (err) {
      logger.error('Failed to get Square payments status', err instanceof Error ? err : new Error(String(err)), {
        vendorId: vendor.id,
        vendorSlug
      });
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to get status'
      });
    }
  }

  if (req.method === 'POST') {
    // Re-check Square payments activation
    if (!squareConnected) {
      return res.status(400).json({
        success: false,
        error: 'Square is not connected. Connect Square in Settings first.'
      });
    }

    const locId = locations[0]?.externalLocationId ?? vendor.squareLocationId ?? null;

    try {
      const result = await checkSquarePaymentsActivation(vendor);
      const checkedAt = new Date().toISOString();

      await dataClient.setSquarePaymentsActivationStatus(vendor.id, {
        activated: result.activated,
        checkedAt,
        error: result.error ?? null,
        locationId: locId
      });

      logger.info('Square payments activation check', {
        vendorId: vendor.id,
        locationId: locId,
        activated: result.activated,
        error: result.error
      });

      const data = await buildResponse();
      return res.status(200).json({ success: true, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const checkedAt = new Date().toISOString();
      await dataClient.setSquarePaymentsActivationStatus(vendor.id, {
        activated: false,
        checkedAt,
        error: message,
        locationId: locId
      });

      logger.error('Square payments activation check failed', err instanceof Error ? err : new Error(message), {
        vendorId: vendor.id,
        locationId: locId
      });

      const data = await buildResponse();
      return res.status(200).json({ success: true, data });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
