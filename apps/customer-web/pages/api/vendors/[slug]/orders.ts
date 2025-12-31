import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerDataClient } from '../../../../lib/dataClient';

type OrderHistoryResponse =
  | {
      ok: true;
      orders: Array<{
        id: string;
        placedAt: string;
        squareOrderId: string;
        snapshotJson: unknown;
        fulfillmentStatus?: string | null;
        readyAt?: string | null;
        completedAt?: string | null;
      }>;
    }
  | { ok: false; error: string };

const normalizeSlug = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function handler(req: NextApiRequest, res: NextApiResponse<OrderHistoryResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = normalizeSlug(req.query.slug);
  const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
  if (!slug || !userId) {
    return res.status(400).json({ ok: false, error: 'Vendor slug and userId required' });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  try {
    const orders = await dataClient.listOrderSnapshotsForUser(vendor.id, userId);
    return res.status(200).json({
      ok: true,
      orders: orders.map((order) => ({
        id: order.id,
        placedAt: order.placedAt,
        squareOrderId: order.squareOrderId,
        snapshotJson: order.snapshotJson,
        fulfillmentStatus: order.fulfillmentStatus,
        readyAt: order.readyAt,
        completedAt: order.completedAt
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load order history';
    return res.status(500).json({ ok: false, error: message });
  }
}
