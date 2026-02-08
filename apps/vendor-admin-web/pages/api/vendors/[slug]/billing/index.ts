import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';
import { isTrialExpired } from '../../../../../lib/trialUtils';
import type { BillingPlanId } from '@countrtop/models';

type BillingGetResponse =
  | {
      success: true;
      data: {
        planId: BillingPlanId;
        planName: string;
        amountCents: number;
        interval: 'month' | 'year' | null;
        status: string;
        currentPeriodEnd: string | null;
        trialEndsAt: string | null;
        isTrialExpired: boolean;
        paymentMethod: { brand: string; last4: string } | null;
        canUpgrade: boolean;
        stripeCustomerId: string | null;
        /** Set when planId is kds_only or online_only (per-location pricing). */
        locationsCount?: number | null;
      };
    }
  | { success: false; error: string };

const PLAN_NAMES: Record<BillingPlanId, string> = {
  beta: 'Beta',
  trial: 'Trial',
  starter: 'Starter',
  pro: 'Pro',
  kds_only: 'KDS only',
  online_only: 'Online ordering only'
};

/** Per-month amounts in cents. For kds_only/online_only, per-location (use locationsCount for total). */
const PLAN_AMOUNTS: Record<BillingPlanId, number> = {
  beta: 0,
  trial: 0,
  starter: 4900,
  pro: 9900,
  kds_only: 1500,
  online_only: 2500
};

/**
 * GET /api/vendors/[slug]/billing
 * Returns current plan, status, payment method summary, and upgrade eligibility.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BillingGetResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!slug || typeof slug !== 'string') {
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
    const status = billing?.status ?? 'active';
    const currentPeriodEnd = billing?.currentPeriodEnd ?? null;
    const trialEndsAt = billing?.trialEndsAt ?? null;
    const trialExpired = isTrialExpired(billing);
    const stripeCustomerId = billing?.stripeCustomerId ?? null;

    let paymentMethod: { brand: string; last4: string } | null = null;
    if (stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
        const customer = await stripe.customers.retrieve(stripeCustomerId, {
          expand: ['invoice_settings.default_payment_method']
        });
        if (!customer.deleted && customer.invoice_settings?.default_payment_method) {
          const pm = customer.invoice_settings.default_payment_method as Stripe.PaymentMethod;
          if (pm && pm.card) {
            paymentMethod = { brand: pm.card.brand ?? 'card', last4: pm.card.last4 ?? '****' };
          }
        }
      } catch (e) {
        // Non-fatal: just leave paymentMethod null
      }
    }

    const canUpgrade = planId === 'beta' || planId === 'trial';

    let locationsCount: number | null = null;
    if (planId === 'kds_only' || planId === 'online_only') {
      const intake = await dataClient.getVendorIntake(vendor.id);
      if (intake?.locationsCount != null && intake.locationsCount > 0) {
        locationsCount = intake.locationsCount;
      } else {
        const locations = await dataClient.listVendorLocations(vendor.id);
        locationsCount = Math.max(1, locations.length);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        planId,
        planName: PLAN_NAMES[planId],
        amountCents: PLAN_AMOUNTS[planId],
        interval: planId === 'beta' || planId === 'trial' ? null : ('month' as const),
        status,
        currentPeriodEnd,
        trialEndsAt,
        isTrialExpired: trialExpired,
        paymentMethod,
        canUpgrade,
        stripeCustomerId,
        ...(locationsCount != null ? { locationsCount } : {})
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Billing GET error:', error);
    return res.status(500).json({ success: false, error: `Failed to load billing: ${message}` });
  }
}
