import type { NextApiRequest, NextApiResponse } from 'next';

import { OpsOrder, OrderItem } from '@countrtop/models';
import { getServerDataClient } from '../../../../../lib/dataClient';

type OrdersResponse = { ok: true; orders: OpsOrder[] } | { ok: false; error: string };

const normalizeSlug = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const normalizeItems = (snapshot: Record<string, unknown> | null | undefined): OrderItem[] => {
  const rawItems = Array.isArray(snapshot?.items) ? snapshot?.items : [];
  return rawItems
    .map((item: any) => ({
      name: typeof item?.name === 'string' ? item.name : 'Item',
      quantity: typeof item?.quantity === 'number' ? item.quantity : Number(item?.quantity ?? 1),
      price: typeof item?.price === 'number' ? item.price : Number(item?.price ?? 0)
    }))
    .filter((item) => item.quantity > 0);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<OrdersResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = normalizeSlug(req.query.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  try {
    const orders = await dataClient.listOrderSnapshotsForVendor(vendor.id);
    const sorted = [...orders].sort(
      (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()
    );
    const mapped = sorted.slice(0, 30).map((order) => ({
      id: order.id,
      squareOrderId: order.squareOrderId,
      placedAt: order.placedAt,
      status: 'new' as OpsOrder['status'],
      items: normalizeItems(order.snapshotJson),
      total: Number(order.snapshotJson?.total ?? 0),
      currency: (order.snapshotJson?.currency as string) ?? 'USD',
      userId: order.userId ?? null
    }));

    return res.status(200).json({ ok: true, orders: mapped });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load orders';
    return res.status(500).json({ ok: false, error: message });
  }
}
