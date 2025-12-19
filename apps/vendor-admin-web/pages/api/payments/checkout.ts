import type { NextApiRequest, NextApiResponse } from 'next';

import { PaymentService } from '@countrtop/functions';

type IntentRequestBody = {
  mode?: 'payment' | 'setup';
  amount?: number;
  currency?: string;
  orderId?: string;
  userId?: string;
  vendorId?: string;
  customerId?: string;
  description?: string;
  setupFutureUsage?: 'on_session' | 'off_session';
};

type IntentResponse =
  | {
      ok: true;
      mode: 'payment';
      paymentIntentId: string;
      clientSecret: string;
    }
  | {
      ok: true;
      mode: 'setup';
      setupIntentId: string;
      clientSecret: string;
    }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<IntentResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ ok: false, error: 'Stripe secret key not configured' });
  }

  const body = req.body as IntentRequestBody;
  const mode = body.mode ?? 'payment';
  if (mode === 'payment' && typeof body?.amount !== 'number') {
    return res.status(400).json({ ok: false, error: 'amount is required for payment intents' });
  }

  const service = new PaymentService({ secretKey, defaultCurrency: body.currency ?? 'usd' });

  try {
    if (mode === 'setup') {
      const setupIntent = await service.createSetupIntent({
        customerId: body.customerId,
        userId: body.userId,
        vendorId: body.vendorId
      });
      return res.status(200).json({
        ok: true,
        mode: 'setup',
        setupIntentId: setupIntent.setupIntentId,
        clientSecret: setupIntent.clientSecret
      });
    }

    const paymentIntent = await service.createPaymentIntent({
      amount: body.amount ?? 0,
      currency: body.currency,
      orderId: body.orderId,
      userId: body.userId,
      vendorId: body.vendorId,
      customerId: body.customerId,
      description: body.description,
      setupFutureUsage: body.setupFutureUsage
    });

    return res.status(200).json({
      ok: true,
      mode: 'payment',
      paymentIntentId: paymentIntent.paymentIntentId,
      clientSecret: paymentIntent.clientSecret
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected payment error';
    return res.status(500).json({ ok: false, error: message });
  }
}
