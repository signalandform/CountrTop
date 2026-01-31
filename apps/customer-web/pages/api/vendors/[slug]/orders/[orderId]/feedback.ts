import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../../../lib/dataClient';

type FeedbackResponse = { ok: true } | { ok: false; error: string };

/**
 * POST /api/vendors/[slug]/orders/[orderId]/feedback
 * Body: { rating: 'thumbs_up' | 'thumbs_down' }
 * orderId = Square/external order ID (same as tracking)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FeedbackResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slugParam = req.query.slug;
  const orderIdParam = req.query.orderId;
  const vendorSlug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const orderId = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;

  if (!vendorSlug || !orderId) {
    return res.status(400).json({ ok: false, error: 'Vendor slug and order ID required' });
  }

  const rating = req.body?.rating;
  if (rating !== 'thumbs_up' && rating !== 'thumbs_down') {
    return res.status(400).json({ ok: false, error: 'rating must be thumbs_up or thumbs_down' });
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(vendorSlug);
    if (!vendor) {
      return res.status(404).json({ ok: false, error: 'Vendor not found' });
    }

    const snapshot = await dataClient.getOrderSnapshotBySquareOrderId(vendor.id, orderId);
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: 'Order not found' });
    }

    await dataClient.updateOrderSnapshotFeedback(snapshot.id, rating);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save feedback';
    return res.status(500).json({ ok: false, error: message });
  }
}
