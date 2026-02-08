import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';
import { canUseCrm } from '../../../../../lib/planCapabilities';
import type { BillingPlanId } from '@countrtop/models';

type CustomerEntry = {
  email: string;
  displayName?: string | null;
  orderCount: number;
};

type CustomersResponse =
  | { success: true; customers: CustomerEntry[] }
  | { success: false; error: string };

const normalizeSlug = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CustomersResponse>
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
    const planId: BillingPlanId = (billing?.planId as BillingPlanId) ?? 'trial';
    if (!canUseCrm(planId)) {
      return res.status(403).json({
        success: false,
        error: 'CRM is a Pro feature. Upgrade to Pro to send promotional emails to past customers.'
      });
    }

    const orders = await dataClient.listOrderSnapshotsForVendor(vendor.id);
    const unsubscribes = await dataClient.listVendorEmailUnsubscribes(vendor.id);
    const unsubSet = new Set(unsubscribes.map((e) => e.trim().toLowerCase()));

    const emailToData = new Map<string, { displayName?: string | null; orderCount: number }>();
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
        const guestName = typeof snapshot?.customerName === 'string' ? snapshot.customerName : null;
        if (guestEmail) {
          const key = guestEmail.trim().toLowerCase();
          if (key) {
            const existing = emailToData.get(key);
            emailToData.set(key, {
              displayName: existing?.displayName ?? guestName ?? null,
              orderCount: (existing?.orderCount ?? 0) + 1
            });
          }
        }
      }
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
      for (const [userId, orderCount] of userIdToOrderCount) {
        const { data: authUser } = await supabase.auth.admin.getUserById(userId);
        const email = authUser?.user?.email?.trim().toLowerCase();
        if (!email) continue;
        const displayName =
          (authUser?.user?.user_metadata?.display_name as string) ??
          authUser?.user?.email?.split('@')[0] ??
          null;
        const existing = emailToData.get(email);
        emailToData.set(email, {
          displayName: existing?.displayName ?? displayName,
          orderCount: (existing?.orderCount ?? 0) + orderCount
        });
      }
    }

    const customers: CustomerEntry[] = [];
    for (const [email, data] of emailToData.entries()) {
      if (unsubSet.has(email)) continue;
      customers.push({
        email,
        displayName: data.displayName ?? null,
        orderCount: data.orderCount
      });
    }
    customers.sort((a, b) => b.orderCount - a.orderCount);

    return res.status(200).json({ success: true, customers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load customers';
    return res.status(500).json({ success: false, error: message });
  }
}
