/**
 * Ops-only endpoint to reconcile Square orders for a specific vendor/location.
 * Use when a webhook was dropped and you need to repair without running scripts.
 *
 * POST /api/ops/reconcile
 * Body: { vendorSlug: string, locationId?: string, minutesBack?: number }
 * Auth: Authorization: Bearer <CRON_SECRET|OPS_SECRET>
 *
 * Example:
 *   curl -X POST https://yourdomain.com/api/ops/reconcile \
 *     -H "Content-Type: application/json" \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -d '{"vendorSlug":"sunset","minutesBack":120}'
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { reconcileSquareOrdersForLocation } from '@countrtop/data/src/reconcile';
import { createLogger } from '@countrtop/api-client';
import { getServerDataClient } from '../../../lib/dataClient';
import { createRateLimit } from '../../../lib/rateLimit';

const logger = createLogger({ requestId: 'ops-reconcile' });

const rateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: 'Too many reconcile requests. Please wait a moment before trying again.'
});

type ReconcileResponse = {
  ok: boolean;
  vendorSlug?: string;
  locationId?: string;
  minutesBack?: number;
  stats?: { ordersFetched: number; processed: number; createdTickets: number; updatedTickets: number; errors: number };
  error?: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse<ReconcileResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  const secret = authHeader?.replace(/^Bearer\s+/i, '') || (req.body?.secret as string);
  const expectedSecret = process.env.CRON_SECRET || process.env.OPS_SECRET || process.env.VERCEL_CRON_SECRET;

  if (expectedSecret && (!secret || secret !== expectedSecret)) {
    logger.warn('Unauthorized ops reconcile request');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const body = typeof req.body === 'object' ? req.body : {};
  const vendorSlug = (body.vendorSlug ?? req.query.vendorSlug) as string | undefined;
  const locationId = (body.locationId ?? req.query.locationId) as string | undefined;
  const minutesBack = typeof body.minutesBack === 'number'
    ? body.minutesBack
    : parseInt(String(body.minutesBack ?? req.query.minutesBack ?? '60'), 10);

  if (!vendorSlug?.trim()) {
    return res.status(400).json({ ok: false, error: 'vendorSlug is required' });
  }

  if (Number.isNaN(minutesBack) || minutesBack < 1 || minutesBack > 10080) {
    return res.status(400).json({ ok: false, error: 'minutesBack must be between 1 and 10080 (7 days)' });
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(vendorSlug.trim());
    if (!vendor) {
      return res.status(404).json({ ok: false, error: `Vendor not found: ${vendorSlug}` });
    }

    const targetLocationId = locationId?.trim() || vendor.squareLocationId;
    if (!targetLocationId || targetLocationId === 'SQUARE_LOCATION_DEMO') {
      return res.status(400).json({
        ok: false,
        error: 'No Square location ID. Provide locationId or ensure vendor has square_location_id.'
      });
    }

    logger.info('Ops reconcile started', { vendorSlug, locationId: targetLocationId, minutesBack });

    const stats = await reconcileSquareOrdersForLocation(
      dataClient,
      vendor,
      targetLocationId,
      minutesBack
    );

    logger.info('Ops reconcile complete', {
      vendorSlug,
      locationId: targetLocationId,
      ordersFetched: stats.ordersFetched,
      processed: stats.processed,
      createdTickets: stats.createdTickets,
      updatedTickets: stats.updatedTickets,
      errors: stats.errors
    });

    return res.status(200).json({
      ok: true,
      vendorSlug: vendor.slug,
      locationId: targetLocationId,
      minutesBack,
      stats: {
        ordersFetched: stats.ordersFetched,
        processed: stats.processed,
        createdTickets: stats.createdTickets,
        updatedTickets: stats.updatedTickets,
        errors: stats.errors
      }
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Ops reconcile failed', error instanceof Error ? error : new Error(errMsg), {
      vendorSlug,
      locationId
    });
    return res.status(500).json({ ok: false, error: errMsg });
  }
}

export default rateLimit(handler);
