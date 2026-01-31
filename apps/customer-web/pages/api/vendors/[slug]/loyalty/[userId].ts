import type { NextApiRequest, NextApiResponse } from 'next';
import type { BillingPlanId } from '@countrtop/models';

import { getServerDataClient } from '../../../../../lib/dataClient';

function canUseLoyalty(planId: BillingPlanId): boolean {
  return planId === 'starter' || planId === 'pro';
}

type LoyaltyResponse =
  | {
      ok: true;
      balance: number;
      entries: Array<{ id: string; pointsDelta: number; createdAt: string; orderId: string }>;
      /** Redemption rules when loyalty is enabled (for checkout UI) */
      redemptionRules?: { centsPerPoint: number; minPoints: number; maxPointsPerOrder: number };
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

  // Free-tier (Beta/Trial) vendors don't have loyalty; return success with zero balance so customer sign-in flow never fails.
  // If billing fetch throws (e.g. table missing, RLS), treat as free tier so we never 500 and break sign-in.
  let planId: BillingPlanId = 'beta';
  try {
    const billing = await dataClient.getVendorBilling(vendor.id);
    planId = (billing?.planId as BillingPlanId) ?? 'beta';
  } catch {
    // Assume free tier on any billing error
  }
  if (!canUseLoyalty(planId)) {
    return res.status(200).json({
      ok: true,
      balance: 0,
      entries: []
    });
  }

  try {
    const loyaltyEnabled = await dataClient.getVendorFeatureFlag(vendor.id, 'customer_loyalty_enabled');
    const [entries, balance, settings] = await Promise.all([
      dataClient.listLoyaltyEntriesForUser(vendor.id, userId),
      dataClient.getLoyaltyBalance(vendor.id, userId),
      loyaltyEnabled ? dataClient.getVendorLoyaltySettings(vendor.id) : Promise.resolve(null)
    ]);
    const response: LoyaltyResponse = {
      ok: true,
      balance,
      entries: entries.map((entry) => ({
        id: entry.id,
        pointsDelta: entry.pointsDelta,
        createdAt: entry.createdAt,
        orderId: entry.orderId
      }))
    };
    if (loyaltyEnabled && settings) {
      response.redemptionRules = {
        centsPerPoint: settings.centsPerPoint,
        minPoints: settings.minPointsToRedeem,
        maxPointsPerOrder: settings.maxPointsPerOrder
      };
    }
    return res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load loyalty';
    return res.status(500).json({ ok: false, error: message });
  }
}
