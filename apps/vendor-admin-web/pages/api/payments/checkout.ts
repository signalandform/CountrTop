import type { NextApiRequest, NextApiResponse } from 'next';

import { PaymentService } from '@countrtop/functions';

type CheckoutRequestBody = {
  amount: number;
  currency?: string;
  orderId?: string;
  userId?: string;
  vendorId?: string;
  customerId?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  mode?: 'payment' | 'setup';
};

type CheckoutResponse =
  | {
      ok: true;
      paymentIntentId?: string;
      clientSecret?: string;
      checkoutSessionId?: string;
      checkoutUrl?: string | null;
    }
  | { ok: false; error: string };

const resolveUrl = (value: string | undefined, fallbackEnv: string | undefined, defaultValue: string) =>
  value ?? fallbackEnv ?? defaultValue;

export default async function handler(req: NextApiRequest, res: NextApiResponse<CheckoutResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ ok: false, error: 'Stripe secret key not configured' });
  }

  const body = req.body as CheckoutRequestBody;
  if (typeof body?.amount !== 'number') {
    return res.status(400).json({ ok: false, error: 'amount is required' });
  }

  const service = new PaymentService({ secretKey, defaultCurrency: body.currency ?? 'usd' });

  try {
    const paymentIntent = await service.createPaymentIntent({
      amount: body.amount,
      currency: body.currency,
      orderId: body.orderId,
      userId: body.userId,
      vendorId: body.vendorId,
      customerId: body.customerId,
      description: body.description
    });

    const checkoutSession = await service.createCheckoutSession({
      amount: body.amount,
      currency: body.currency,
      orderId: body.orderId,
      userId: body.userId,
      vendorId: body.vendorId,
      customerId: body.customerId,
      description: body.description,
      mode: body.mode,
      successUrl: resolveUrl(body.successUrl, process.env.CHECKOUT_SUCCESS_URL, 'https://countrtop.app/success'),
      cancelUrl: resolveUrl(body.cancelUrl, process.env.CHECKOUT_CANCEL_URL, 'https://countrtop.app/cancel')
    });

    return res.status(200).json({
      ok: true,
      paymentIntentId: paymentIntent.paymentIntentId,
      clientSecret: paymentIntent.clientSecret,
      checkoutSessionId: checkoutSession.sessionId,
      checkoutUrl: checkoutSession.url
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected payment error';
    return res.status(500).json({ ok: false, error: message });
  }
}
