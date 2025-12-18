import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';

import { createDataClient } from '@countrtop/data';
import { LoyaltyService, StripeWebhookHandler } from '@countrtop/functions';

export const config = {
  api: {
    bodyParser: false
  }
};

const API_VERSION: Stripe.LatestApiVersion = '2024-06-20';

const bufferRequest = (req: NextApiRequest): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    req.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

type WebhookResponse = {
  acknowledged: boolean;
  type: 'payment_succeeded' | 'payment_failed' | 'ignored';
  orderId?: string;
  paymentIntentId?: string;
  reason?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<WebhookResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const stripeSignature = req.headers['stripe-signature'];
  if (!stripeSignature || Array.isArray(stripeSignature)) {
    return res.status(400).json({ acknowledged: false, type: 'ignored', reason: 'Missing signature' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return res.status(500).json({
      acknowledged: false,
      type: 'ignored',
      reason: 'Stripe credentials are not configured'
    });
  }

  const stripe = new Stripe(secretKey, { apiVersion: API_VERSION });
  const dataClient = createDataClient({ useMockData: true });
  const loyalty = new LoyaltyService(dataClient);
  const webhook = new StripeWebhookHandler(stripe, loyalty);

  try {
    const payload = await bufferRequest(req);
    const result = await webhook.handleEvent(payload, stripeSignature, webhookSecret);
    const statusCode = result.type === 'ignored' ? 200 : 202;
    return res.status(statusCode).json(result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown webhook error';
    return res.status(400).json({ acknowledged: false, type: 'ignored', reason });
  }
}
