import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerDataClient } from '../../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../../lib/auth';

type StatusRequest = {
  status?: 'READY' | 'COMPLETE';
};

type StatusResponse =
  | { ok: true; order: { id: string; fulfillmentStatus: string | null | undefined } }
  | { ok: false; error: string };

const normalizeSlug = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const normalizeOrderId = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function handler(req: NextApiRequest, res: NextApiResponse<StatusResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get vendor slug from route param (preferred) or fallback to header
  const vendorSlug = normalizeSlug(req.query.slug) || (req.headers['x-vendor-slug'] as string | undefined);
  if (!vendorSlug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  // Check vendor admin access
  const authResult = await requireVendorAdminApi(req, res, vendorSlug);
  if (!authResult.authorized) {
    const statusCode = authResult.statusCode ?? 401;
    return res.status(statusCode).json({ ok: false, error: authResult.error ?? 'Unauthorized' });
  }

  const orderId = normalizeOrderId(req.query.orderId);
  if (!orderId) {
    return res.status(400).json({ ok: false, error: 'Order ID required' });
  }

  const { status } = req.body as StatusRequest;
  if (!status || (status !== 'READY' && status !== 'COMPLETE')) {
    return res.status(400).json({ ok: false, error: 'Status must be READY or COMPLETE' });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(vendorSlug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  try {
    // Verify order exists and belongs to vendor before updating
    const existingOrder = await dataClient.getOrderSnapshot(orderId);
    if (!existingOrder) {
      return res.status(404).json({ ok: false, error: 'Order not found' });
    }

    if (existingOrder.vendorId !== vendor.id) {
      return res.status(403).json({ ok: false, error: 'Order does not belong to vendor' });
    }

    // Update the order status
    const updatedOrder = await dataClient.updateOrderSnapshotStatus(orderId, vendor.id, status);

    return res.status(200).json({
      ok: true,
      order: {
        id: updatedOrder.id,
        fulfillmentStatus: updatedOrder.fulfillmentStatus
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update order status';
    return res.status(500).json({ ok: false, error: message });
  }
}

