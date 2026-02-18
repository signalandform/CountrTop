import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@countrtop/api-client';
import { getServerDataClient } from '../../../lib/dataClient';
import type { BillingPlanId } from '@countrtop/models';

const logger = createLogger({ requestId: 'stripe-webhook' });

async function insertStripeWebhookEventIfNew(eventId: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase
    .from('stripe_webhook_events')
    .insert({ event_id: eventId })
    .select('event_id')
    .single();
  if (error?.code === '23505') return false; // duplicate
  if (error) throw error;
  return true;
}

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
    logger.error('STRIPE_WEBHOOK_SECRET is not set');
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
    logger.error('Stripe webhook signature verification failed', err);
    return res.status(400).json({ error: `Webhook Error: ${message}` });
  }

  // Idempotency: skip if already processed (Stripe retries)
  try {
    const isNew = await insertStripeWebhookEventIfNew(event.id);
    if (!isNew) {
      logger.info('Stripe webhook event already processed', { eventId: event.id });
      return res.status(200).json({ received: true });
    }
  } catch (err) {
    logger.error('Stripe webhook idempotency check failed', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  const dataClient = getServerDataClient();

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const vendorId = subscription.metadata?.vendor_id;
        if (!vendorId) {
          logger.warn('Stripe subscription missing vendor_id in metadata', { subscriptionId: subscription.id });
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
          planId: 'trial',
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
    logger.error('Stripe webhook handler error', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
