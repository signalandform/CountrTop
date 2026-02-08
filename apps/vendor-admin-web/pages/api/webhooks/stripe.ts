import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getServerDataClient } from '../../../lib/dataClient';
import type { BillingPlanId } from '@countrtop/models';

export const config = {
  api: { bodyParser: false }
};

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * POST /api/webhooks/stripe
 * Stripe webhook: subscription and invoice events. Updates vendor_billing.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }
    event = Stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown';
    console.error('Stripe webhook signature verification failed:', message);
    return res.status(400).json({ error: `Webhook Error: ${message}` });
  }

  const dataClient = getServerDataClient();

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const vendorId = subscription.metadata?.vendor_id;
        if (!vendorId) {
          console.warn('Stripe subscription missing vendor_id in metadata', { subscriptionId: subscription.id });
          break;
        }
        const plan = (subscription.metadata?.plan ?? 'starter') as BillingPlanId;
        const planId: BillingPlanId =
          plan === 'starter' || plan === 'pro' || plan === 'kds_only' || plan === 'online_only'
            ? plan
            : 'starter';
        const currentPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;
        await dataClient.upsertVendorBilling(vendorId, {
          stripeSubscriptionId: subscription.id,
          planId,
          status: subscription.status,
          currentPeriodEnd
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const vendorId = subscription.metadata?.vendor_id;
        if (!vendorId) break;
        await dataClient.upsertVendorBilling(vendorId, {
          stripeSubscriptionId: null,
          planId: 'beta',
          status: 'canceled',
          currentPeriodEnd: null
        });
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed':
        // Optionally update invoice cache or send email; for now just acknowledge
        break;
      default:
        // Unhandled event type
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handler error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
