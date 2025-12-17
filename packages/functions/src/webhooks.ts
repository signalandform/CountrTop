import Stripe from 'stripe';

import { LoyaltyService } from './loyalty';

export type WebhookHandlerResult = {
  acknowledged: boolean;
  type: 'payment_succeeded' | 'payment_failed' | 'ignored';
  orderId?: string;
  paymentIntentId?: string;
  reason?: string;
};

export class StripeWebhookHandler {
  constructor(private readonly stripe: Stripe, private readonly loyalty?: LoyaltyService) {}

  handleEvent = async (
    payload: Buffer | string,
    signature: string,
    webhookSecret: string
  ): Promise<WebhookHandlerResult> => {
    const event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await this.handlePaymentSucceeded(paymentIntent);
      return {
        acknowledged: true,
        type: 'payment_succeeded',
        orderId: paymentIntent.metadata.orderId,
        paymentIntentId: paymentIntent.id
      };
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      return {
        acknowledged: true,
        type: 'payment_failed',
        orderId: paymentIntent.metadata.orderId,
        paymentIntentId: paymentIntent.id,
        reason: paymentIntent.last_payment_error?.message
      };
    }

    return { acknowledged: true, type: 'ignored' };
  };

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    if (!this.loyalty) return;

    if (!paymentIntent.metadata?.userId || !paymentIntent.metadata?.vendorId) {
      return;
    }

    const totalInDollars = (paymentIntent.amount_received ?? paymentIntent.amount) / 100;

    await this.loyalty.accrueForOrder({
      orderId: paymentIntent.metadata.orderId,
      userId: paymentIntent.metadata.userId,
      vendorId: paymentIntent.metadata.vendorId,
      total: totalInDollars,
      description: 'Payment completed via Stripe'
    });
  }
}
