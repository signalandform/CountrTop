import Stripe from 'stripe';

export type PaymentServiceConfig = {
  secretKey: string;
  defaultCurrency?: string;
};

export type CheckoutSessionRequest = {
  amount: number;
  currency?: string;
  successUrl: string;
  cancelUrl: string;
  orderId?: string;
  userId?: string;
  vendorId?: string;
  customerId?: string;
  description?: string;
  metadata?: Record<string, string>;
  lineItems?: Stripe.Checkout.SessionCreateParams.LineItem[];
  mode?: Stripe.Checkout.SessionCreateParams.Mode;
};

export type CheckoutSessionResult = {
  sessionId: string;
  url?: string | null;
  paymentIntentId?: string;
};

export type PaymentIntentRequest = {
  amount: number;
  currency?: string;
  orderId?: string;
  userId?: string;
  vendorId?: string;
  customerId?: string;
  description?: string;
  metadata?: Record<string, string>;
};

export type PaymentIntentResult = {
  paymentIntentId: string;
  clientSecret: string;
};

const API_VERSION: Stripe.LatestApiVersion = '2024-06-20';

export class PaymentService {
  private readonly stripe: Stripe;
  private readonly defaultCurrency: string;

  constructor(config: PaymentServiceConfig) {
    this.defaultCurrency = config.defaultCurrency ?? 'usd';
    this.stripe = new Stripe(config.secretKey, { apiVersion: API_VERSION });
  }

  createPaymentIntent = async (request: PaymentIntentRequest): Promise<PaymentIntentResult> => {
    const currency = request.currency ?? this.defaultCurrency;
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(request.amount),
      currency,
      customer: request.customerId,
      description: request.description,
      metadata: this.buildMetadata(request)
    });

    if (!paymentIntent.client_secret) {
      throw new Error('Stripe did not return a client secret for the PaymentIntent.');
    }

    return { paymentIntentId: paymentIntent.id, clientSecret: paymentIntent.client_secret };
  };

  createCheckoutSession = async (request: CheckoutSessionRequest): Promise<CheckoutSessionResult> => {
    const currency = request.currency ?? this.defaultCurrency;
    const lineItems = request.lineItems ?? [
      {
        price_data: {
          currency,
          product_data: { name: request.description ?? 'Order payment' },
          unit_amount: Math.round(request.amount)
        },
        quantity: 1
      }
    ];

    const session = await this.stripe.checkout.sessions.create({
      mode: request.mode ?? 'payment',
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      customer: request.customerId,
      line_items: lineItems,
      payment_intent_data: { metadata: this.buildMetadata(request) },
      metadata: this.buildMetadata(request)
    });

    return {
      sessionId: session.id,
      url: session.url,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined
    };
  };

  get client() {
    return this.stripe;
  }

  private buildMetadata(
    request: Pick<PaymentIntentRequest, 'metadata' | 'orderId' | 'userId' | 'vendorId'>
  ): Record<string, string> {
    const baseMetadata: Record<string, string> = {};
    if (request.orderId) baseMetadata.orderId = request.orderId;
    if (request.userId) baseMetadata.userId = request.userId;
    if (request.vendorId) baseMetadata.vendorId = request.vendorId;

    return {
      ...baseMetadata,
      ...(request.metadata ?? {})
    };
  }
}
