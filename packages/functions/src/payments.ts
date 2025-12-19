import Stripe from 'stripe';

export type PaymentServiceConfig = {
  secretKey: string;
  defaultCurrency?: string;
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
  setupFutureUsage?: Stripe.PaymentIntentCreateParams.SetupFutureUsage;
};

export type PaymentIntentResult = {
  paymentIntentId: string;
  clientSecret: string;
};

export type SetupIntentRequest = {
  customerId?: string;
  userId?: string;
  vendorId?: string;
  metadata?: Record<string, string>;
  usage?: Stripe.SetupIntentCreateParams.Usage;
};

export type SetupIntentResult = {
  setupIntentId: string;
  clientSecret: string;
};

type MetadataRequest = {
  metadata?: Record<string, string>;
  orderId?: string;
  userId?: string;
  vendorId?: string;
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
      metadata: this.buildMetadata(request),
      ...(request.setupFutureUsage ? { setup_future_usage: request.setupFutureUsage } : {})
    });

    if (!paymentIntent.client_secret) {
      throw new Error('Stripe did not return a client secret for the PaymentIntent.');
    }

    return { paymentIntentId: paymentIntent.id, clientSecret: paymentIntent.client_secret };
  };

  createSetupIntent = async (request: SetupIntentRequest): Promise<SetupIntentResult> => {
    const setupIntent = await this.stripe.setupIntents.create({
      customer: request.customerId,
      usage: request.usage ?? 'off_session',
      metadata: this.buildMetadata(request)
    });

    if (!setupIntent.client_secret) {
      throw new Error('Stripe did not return a client secret for the SetupIntent.');
    }

    return { setupIntentId: setupIntent.id, clientSecret: setupIntent.client_secret };
  };

  get client() {
    return this.stripe;
  }

  private buildMetadata(request: MetadataRequest): Record<string, string> {
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
