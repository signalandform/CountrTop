import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerDataClient } from '../../../../../lib/dataClient';

type LoyaltyResponse =
  | {
      ok: true;
      balance: number;
      entries: Array<{ id: string; pointsDelta: number; createdAt: string; orderId: string }>;
    }
  | { ok: false; error: string };

const normalizeSlug = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;
const normalizeUserId = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function handler(req: NextApiRequest, res: NextApiResponse<LoyaltyResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = normalizeSlug(req.query.slug);
  const userId = normalizeUserId(req.query.userId);
  if (!slug || !userId) {
    return res.status(400).json({ ok: false, error: 'Vendor slug and userId required' });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  try {
    const [entries, balance] = await Promise.all([
      dataClient.listLoyaltyEntriesForUser(vendor.id, userId),
      dataClient.getLoyaltyBalance(vendor.id, userId)
    ]);
    return res.status(200).json({
      ok: true,
      balance,
      entries: entries.map((entry) => ({
        id: entry.id,
        pointsDelta: entry.pointsDelta,
        createdAt: entry.createdAt,
        orderId: entry.orderId
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load loyalty';
    return res.status(500).json({ ok: false, error: message });
  }
}
