import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';

type CheckoutPostResponse =
  | { success: true; url: string }
  | { success: false; error: string };

type CheckoutBody = { plan: 'starter' | 'pro' };

/**
 * POST /api/vendors/[slug]/billing/checkout
 * Creates a Stripe Checkout Session for subscribing to Starter or Pro.
 * Redirects to Stripe-hosted checkout; on success Stripe redirects back to billing page.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CheckoutPostResponse>
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
  const priceStarter = process.env.STRIPE_PRICE_STARTER;
  const pricePro = process.env.STRIPE_PRICE_PRO;

  if (!secretKey || !priceStarter || !pricePro) {
    return res.status(500).json({ success: false, error: 'Billing is not configured' });
  }

  const body = req.body as CheckoutBody;
  const plan = body?.plan;
  if (plan !== 'starter' && plan !== 'pro') {
    return res.status(400).json({ success: false, error: 'plan must be starter or pro' });
  }

  const priceId = plan === 'starter' ? priceStarter : pricePro;

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
        email: undefined,
        name: vendor.displayName,
        metadata: { vendor_id: vendor.id, vendor_slug: vendor.slug }
      });
      customerId = customer.id;
      await dataClient.upsertVendorBilling(vendor.id, {
        stripeCustomerId: customerId,
        planId: billing?.planId ?? 'beta',
        status: billing?.status ?? 'active'
      });
    }

    const origin = req.headers.origin ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const basePath = `/vendors/${slug}/billing`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}${basePath}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${basePath}?canceled=true`,
      metadata: { vendor_id: vendor.id, plan },
      subscription_data: { metadata: { vendor_id: vendor.id, plan } }
    });

    const url = session.url;
    if (!url) {
      return res.status(500).json({ success: false, error: 'Failed to create checkout session' });
    }

    return res.status(200).json({ success: true, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Checkout error:', error);
    return res.status(500).json({ success: false, error: `Checkout failed: ${message}` });
  }
}
