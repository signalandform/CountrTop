import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerDataClient } from '../../../../../lib/dataClient';

type ReadyRequest = {
  orderId?: string;
};

type ReadyResponse =
  | { ok: true; status: 'sent' | 'skipped'; delivered: number; reason?: string }
  | { ok: false; error: string };

const normalizeSlug = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const sendExpoPush = async (tokens: string[], title: string, body: string, data?: Record<string, unknown>) => {
  if (tokens.length === 0) return null;

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {})
    },
    body: JSON.stringify(
      tokens.map((token) => ({
        to: token,
        title,
        body,
        data
      }))
    )
  });

  if (!response.ok) {
    throw new Error(`Expo push failed with status ${response.status}`);
  }

  return response.json();
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<ReadyResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = normalizeSlug(req.query.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  const { orderId } = req.body as ReadyRequest;
  if (!orderId) {
    return res.status(400).json({ ok: false, error: 'Order id required' });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  try {
    const order = await dataClient.getOrderSnapshot(orderId);
    if (!order || order.vendorId !== vendor.id) {
      return res.status(404).json({ ok: false, error: 'Order not found' });
    }

    if (!order.userId) {
      return res.status(200).json({
        ok: true,
        status: 'skipped',
        delivered: 0,
        reason: 'Order does not have an associated user'
      });
    }

    const devices = await dataClient.listPushDevicesForUser(order.userId);
    const tokens = [...new Set(devices.map((device) => device.deviceToken).filter(Boolean))];
    if (tokens.length === 0) {
      return res.status(200).json({
        ok: true,
        status: 'skipped',
        delivered: 0,
        reason: 'No push devices registered'
      });
    }

    await sendExpoPush(tokens, 'Order ready', 'Your order is ready for pickup.', {
      orderId: order.id,
      vendorId: vendor.id
    });

    return res.status(200).json({ ok: true, status: 'sent', delivered: tokens.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send ready notification';
    return res.status(500).json({ ok: false, error: message });
  }
}
