import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';
import { canUseCrm, getCrmEmailLimit } from '../../../../../lib/planCapabilities';
import { sendPromotionalEmail } from '@countrtop/email';
import type { BillingPlanId } from '@countrtop/models';

type SendRequest = {
  subject: string;
  body: string;
};

type SendResponse =
  | { success: true; sentCount: number }
  | { success: false; error: string };

const normalizeSlug = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function getCustomerEmails(
  dataClient: ReturnType<typeof getServerDataClient>,
  vendorId: string
): Promise<string[]> {
  const orders = await dataClient.listOrderSnapshotsForVendor(vendorId);
  const unsubscribes = await dataClient.listVendorEmailUnsubscribes(vendorId);
  const unsubSet = new Set(unsubscribes.map((e) => e.trim().toLowerCase()));

  const emailToCount = new Map<string, number>();
  const userIdToOrderCount = new Map<string, number>();

  for (const order of orders) {
    if (order.userId) {
      userIdToOrderCount.set(
        order.userId,
        (userIdToOrderCount.get(order.userId) ?? 0) + 1
      );
    } else {
      const snapshot = order.snapshotJson as Record<string, unknown> | null;
      const guestEmail = typeof snapshot?.customerEmail === 'string' ? snapshot.customerEmail : null;
      if (guestEmail) {
        const key = guestEmail.trim().toLowerCase();
        if (key) emailToCount.set(key, (emailToCount.get(key) ?? 0) + 1);
      }
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    for (const [userId] of userIdToOrderCount) {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email?.trim().toLowerCase();
      if (email) {
        const count = userIdToOrderCount.get(userId) ?? 0;
        emailToCount.set(email, (emailToCount.get(email) ?? 0) + count);
      }
    }
  }

  const emails: string[] = [];
  for (const email of emailToCount.keys()) {
    if (!unsubSet.has(email)) emails.push(email);
  }
  return emails;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendResponse>
) {
  if (req.method !== 'POST') {
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
    const planId: BillingPlanId = (billing?.planId as BillingPlanId) ?? 'trial';
    if (!canUseCrm(planId)) {
      return res.status(403).json({
        success: false,
        error: 'CRM is a Pro feature. Upgrade to Pro to send promotional emails.'
      });
    }

    const now = new Date();
    const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const limit = getCrmEmailLimit(planId);
    const usage = await dataClient.getVendorCrmUsage(vendor.id, periodStart);
    const body = req.body as SendRequest;
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const html = typeof body.body === 'string' ? body.body.trim() : '';
    if (!subject || !html) {
      return res.status(400).json({
        success: false,
        error: 'Subject and body are required'
      });
    }

    const emails = await getCustomerEmails(dataClient, vendor.id);
    if (emails.length === 0) {
      return res.status(200).json({ success: true, sentCount: 0 });
    }

    if (usage + emails.length > limit) {
      return res.status(403).json({
        success: false,
        error: `CRM email limit reached for this month (${usage}/${limit}). Resets next month.`
      });
    }

    const baseUrl = process.env.CUSTOMER_WEB_BASE_URL || '';
    const unsubscribeBaseUrl = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/api/vendors/${encodeURIComponent(slug)}/unsubscribe`
      : undefined;

    const result = await sendPromotionalEmail({
      fromName: vendor.displayName,
      to: emails,
      subject,
      html,
      unsubscribeBaseUrl
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error ?? 'Failed to send emails'
      });
    }

    const sentCount = result.sentCount ?? 0;
    if (sentCount > 0) {
      await dataClient.incrementVendorCrmUsage(vendor.id, periodStart, sentCount);
    }

    return res.status(200).json({
      success: true,
      sentCount
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send';
    return res.status(500).json({ success: false, error: message });
  }
}
