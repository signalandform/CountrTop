import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerDataClient } from '../../../../lib/dataClient';

type OrderSnapshotRequest = {
  squareOrderId: string;
  placedAt?: string;
  userId?: string | null;
  snapshotJson: Record<string, unknown>;
};

type OrderSnapshotResponse =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

const normalizeSlug = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function handler(req: NextApiRequest, res: NextApiResponse<OrderSnapshotResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = normalizeSlug(req.query.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  const body = req.body as OrderSnapshotRequest;
  if (!body?.squareOrderId || !body.snapshotJson) {
    return res.status(400).json({ ok: false, error: 'squareOrderId and snapshotJson required' });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  try {
    const order = await dataClient.createOrderSnapshot({
      vendorId: vendor.id,
      userId: body.userId ?? null,
      squareOrderId: body.squareOrderId,
      placedAt: body.placedAt,
      snapshotJson: body.snapshotJson
    });

    return res.status(200).json({ ok: true, orderId: order.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save order snapshot';
    return res.status(500).json({ ok: false, error: message });
  }
}
