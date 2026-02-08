import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';

type PortalPostResponse =
  | { success: true; url: string }
  | { success: false; error: string };

/**
 * POST /api/vendors/[slug]/billing/portal
 * Creates a Stripe Customer Portal session so the vendor can manage payment method and subscription.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PortalPostResponse>
) {
  if (req.method !== 'POST') {
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

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ success: false, error: 'Billing is not configured' });
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const billing = await dataClient.getVendorBilling(vendor.id);
    const stripe = new Stripe(secretKey);

    let customerId: string | null = billing?.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: vendor.displayName,
        metadata: { vendor_id: vendor.id, vendor_slug: vendor.slug }
      });
      customerId = customer.id;
      await dataClient.upsertVendorBilling(vendor.id, {
        stripeCustomerId: customerId,
        planId: (billing?.planId as 'trial' | 'starter' | 'pro' | 'kds_only' | 'online_only') ?? 'trial',
        status: billing?.status ?? 'active'
      });
    }

    const origin = req.headers.origin ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const returnUrl = `${origin}/vendors/${slug}/billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });

    return res.status(200).json({ success: true, url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Portal error:', error);
    return res.status(500).json({ success: false, error: `Portal failed: ${message}` });
  }
}
