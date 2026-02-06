import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';
import { canUseCrm, getCrmEmailLimit } from '../../../../../lib/planCapabilities';
import type { BillingPlanId } from '@countrtop/models';

type UsageResponse =
  | { success: true; usage: number; limit: number; periodStart: string }
  | { success: false; error: string };

const normalizeSlug = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UsageResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slug = normalizeSlug(req.query.slug);
  if (!slug) {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  const authResult = await requireVendorAdminApi(req, res, slug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode ?? 401).json({
      success: false,
      error: authResult.error ?? 'Unauthorized'
    });
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const billing = await dataClient.getVendorBilling(vendor.id);
    const planId: BillingPlanId = (billing?.planId as BillingPlanId) ?? 'beta';
    if (!canUseCrm(planId)) {
      return res.status(403).json({
        success: false,
        error: 'CRM is a Pro feature. Upgrade to Pro to see usage.'
      });
    }

    const now = new Date();
    const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const limit = getCrmEmailLimit(planId);
    const usage = await dataClient.getVendorCrmUsage(vendor.id, periodStart);

    return res.status(200).json({
      success: true,
      usage,
      limit,
      periodStart
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load usage';
    return res.status(500).json({ success: false, error: message });
  }
}
