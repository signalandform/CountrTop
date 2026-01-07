/**
 * Clover POS Adapter
 * 
 * Implements the POSAdapter interface for Clover.
 * 
 * Clover API Reference:
 * - Base URL: https://api.clover.com/v3/merchants/{merchantId}/
 * - Sandbox: https://sandbox.dev.clover.com/v3/merchants/{merchantId}/
 * - Auth: Bearer token (OAuth access token)
 */

import type { POSAdapter, POSAdapterConfig, CloverCredentials } from '../adapter';
import {
  POSAdapterError,
  POSAuthenticationError,
  POSNotFoundError,
  POSRateLimitError,
  type POSProvider,
  type CanonicalCatalogItem,
  type CanonicalModifierGroup,
  type CanonicalOrder,
  type CanonicalOrderItem,
  type CanonicalOrderStatus,
  type CanonicalLocation,
  type CanonicalWebhookEvent,
  type CheckoutInput,
  type CheckoutResult,
  type WebhookEventType,
  type OrderSource,
} from '../types';

// =============================================================================
// Clover API Types
// =============================================================================

type CloverItem = {
  id: string;
  name: string;
  alternateName?: string;
  price: number;
  priceType?: 'FIXED' | 'VARIABLE' | 'PER_UNIT';
  defaultTaxRates?: boolean;
  cost?: number;
  isRevenue?: boolean;
  stockCount?: number;
  sku?: string;
  hidden?: boolean;
  available?: boolean;
  itemGroup?: { id: string; name: string };
  modifierGroups?: { elements: CloverModifierGroup[] };
};

type CloverModifierGroup = {
  id: string;
  name: string;
  minRequired?: number;
  maxAllowed?: number;
  modifiers?: { elements: CloverModifier[] };
};

type CloverModifier = {
  id: string;
  name: string;
  price?: number;
  available?: boolean;
};

type CloverOrder = {
  id: string;
  currency: string;
  total: number;
  taxRemoved?: boolean;
  isVat?: boolean;
  state?: string;
  manualTransaction?: boolean;
  groupLineItems?: boolean;
  testMode?: boolean;
  payType?: 'SPLIT_CUSTOM' | 'SPLIT_EQUAL' | 'FULL';
  createdTime?: number;
  modifiedTime?: number;
  lineItems?: { elements: CloverLineItem[] };
  payments?: { elements: CloverPayment[] };
  customers?: { elements: CloverCustomer[] };
  note?: string;
  externalReferenceId?: string;
};

type CloverLineItem = {
  id: string;
  name: string;
  price: number;
  unitQty?: number;
  note?: string;
  printed?: boolean;
  exchanged?: boolean;
  refunded?: boolean;
  modifications?: { elements: CloverModification[] };
  item?: { id: string };
};

type CloverModification = {
  id: string;
  name: string;
  amount?: number;
  modifier?: { id: string };
};

type CloverPayment = {
  id: string;
  amount: number;
  tipAmount?: number;
  taxAmount?: number;
  result?: 'SUCCESS' | 'FAIL' | 'INITIATED' | 'VOIDED' | 'VOIDING' | 'AUTH' | 'AUTH_COMPLETED';
  createdTime?: number;
  externalReferenceId?: string;
};

type CloverCustomer = {
  id: string;
  firstName?: string;
  lastName?: string;
  emailAddresses?: { elements: { emailAddress: string }[] };
  phoneNumbers?: { elements: { phoneNumber: string }[] };
};

type CloverMerchant = {
  id: string;
  name: string;
  address?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  phoneNumber?: string;
  tipsEnabled?: boolean;
  defaultCurrency?: string;
  timezone?: string;
};

type CloverWebhookPayload = {
  appId: string;
  merchants: {
    [merchantId: string]: Array<{
      type: string;
      objectId: string;
      ts: number;
    }>;
  };
};

// =============================================================================
// CLOVER ADAPTER
// =============================================================================

export class CloverAdapter implements POSAdapter {
  readonly provider: POSProvider = 'clover';
  private credentials: CloverCredentials;
  private baseUrl: string;
  private debug: boolean;

  constructor(config: POSAdapterConfig) {
    if (config.credentials.provider !== 'clover') {
      throw new Error('CloverAdapter requires Clover credentials');
    }

    this.credentials = config.credentials;
    this.debug = config.debug ?? false;

    // Set base URL based on environment
    this.baseUrl = config.environment === 'production'
      ? 'https://api.clover.com/v3'
      : 'https://sandbox.dev.clover.com/v3';
  }

  // ---------------------------------------------------------------------------
  // HTTP Client
  // ---------------------------------------------------------------------------

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/merchants/${this.credentials.merchantId}${endpoint}`;
    
    if (this.debug) {
      console.log(`[Clover] ${options.method || 'GET'} ${url}`);
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    return response.json();
  }

  private async handleErrorResponse(response: Response): Promise<POSAdapterError> {
    const statusCode = response.status;
    let message = response.statusText;

    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // Ignore JSON parse errors
    }

    if (statusCode === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return new POSRateLimitError(
        'clover',
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
      );
    }

    if (statusCode === 401 || statusCode === 403) {
      return new POSAuthenticationError('clover', message);
    }

    if (statusCode === 404) {
      return new POSNotFoundError('clover', 'resource', '', new Error(message));
    }

    return new POSAdapterError(message, 'clover', 'API_ERROR', statusCode);
  }

  // ---------------------------------------------------------------------------
  // Catalog Operations
  // ---------------------------------------------------------------------------

  async fetchCatalog(locationId: string): Promise<CanonicalCatalogItem[]> {
    try {
      // Clover uses merchantId as location, but we accept locationId for interface compatibility
      const response = await this.fetch<{ elements: CloverItem[] }>(
        '/items?expand=modifierGroups,modifierGroups.modifiers&filter=hidden=false'
      );

      const items = response.elements || [];
      return items
        .filter(item => item.available !== false)
        .map(item => this.mapItemToCanonical(item, locationId));
    } catch (error) {
      throw this.wrapError(error, 'fetchCatalog');
    }
  }

  async fetchCatalogItem(locationId: string, itemId: string): Promise<CanonicalCatalogItem | null> {
    try {
      const item = await this.fetch<CloverItem>(
        `/items/${itemId}?expand=modifierGroups,modifierGroups.modifiers`
      );

      if (!item || item.hidden) {
        return null;
      }

      return this.mapItemToCanonical(item, locationId);
    } catch (error) {
      if (error instanceof POSNotFoundError) {
        return null;
      }
      throw this.wrapError(error, 'fetchCatalogItem');
    }
  }

  // ---------------------------------------------------------------------------
  // Order Operations
  // ---------------------------------------------------------------------------

  async fetchOrder(orderId: string): Promise<CanonicalOrder | null> {
    try {
      const order = await this.fetch<CloverOrder>(
        `/orders/${orderId}?expand=lineItems,payments,customers`
      );

      if (!order) {
        return null;
      }

      return this.mapOrderToCanonical(order);
    } catch (error) {
      if (error instanceof POSNotFoundError) {
        return null;
      }
      throw this.wrapError(error, 'fetchOrder');
    }
  }

  async searchOrders(locationId: string, since: string, until?: string): Promise<CanonicalOrder[]> {
    try {
      const sinceMs = new Date(since).getTime();
      const untilMs = until ? new Date(until).getTime() : Date.now();

      // Clover uses millisecond timestamps
      const response = await this.fetch<{ elements: CloverOrder[] }>(
        `/orders?expand=lineItems,payments&filter=modifiedTime>=${sinceMs}&filter=modifiedTime<=${untilMs}&orderBy=modifiedTime DESC&limit=100`
      );

      const orders = response.elements || [];
      return orders.map(order => this.mapOrderToCanonical(order));
    } catch (error) {
      throw this.wrapError(error, 'searchOrders');
    }
  }

  // ---------------------------------------------------------------------------
  // Checkout Operations
  // ---------------------------------------------------------------------------

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    try {
      // Step 1: Create order with line items
      const lineItems = input.items.map(item => ({
        item: { id: item.catalogItemId },
        unitQty: item.quantity * 1000, // Clover uses 1000 = 1 unit
        note: item.note,
        // Modifiers would need separate handling
      }));

      const orderResponse = await this.fetch<CloverOrder>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          state: 'open',
          manualTransaction: false,
          groupLineItems: true,
          note: input.metadata?.note || '',
          externalReferenceId: input.metadata?.ct_reference_id || `ct_${Date.now()}`,
        }),
      });

      const orderId = orderResponse.id;

      // Step 2: Add line items to order
      for (const lineItem of lineItems) {
        await this.fetch(`/orders/${orderId}/line_items`, {
          method: 'POST',
          body: JSON.stringify(lineItem),
        });
      }

      // Step 3: For online checkout, Clover uses their eCommerce API
      // This would typically redirect to Clover's hosted checkout
      // For now, we create the order and return a checkout URL
      
      // Note: Full eCommerce integration requires Clover's eCommerce API key
      // and hosted checkout page setup. This is a simplified version.
      const checkoutUrl = `https://www.clover.com/pay/${this.credentials.merchantId}?orderId=${orderId}&redirect=${encodeURIComponent(input.redirectUrl)}`;

      return {
        checkoutUrl,
        orderId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      };
    } catch (error) {
      throw this.wrapError(error, 'createCheckout');
    }
  }

  // ---------------------------------------------------------------------------
  // Location Operations
  // ---------------------------------------------------------------------------

  async fetchLocations(): Promise<CanonicalLocation[]> {
    try {
      // Clover merchants typically have one "location" per merchant account
      // Multi-location is handled by separate merchant accounts
      const merchant = await this.fetch<CloverMerchant>('');

      return [this.mapMerchantToLocation(merchant)];
    } catch (error) {
      throw this.wrapError(error, 'fetchLocations');
    }
  }

  async fetchLocation(locationId: string): Promise<CanonicalLocation | null> {
    try {
      // For Clover, locationId should match merchantId
      if (locationId !== this.credentials.merchantId) {
        return null;
      }

      const merchant = await this.fetch<CloverMerchant>('');
      return this.mapMerchantToLocation(merchant);
    } catch (error) {
      if (error instanceof POSNotFoundError) {
        return null;
      }
      throw this.wrapError(error, 'fetchLocation');
    }
  }

  // ---------------------------------------------------------------------------
  // Webhook Operations
  // ---------------------------------------------------------------------------

  async verifyWebhook(headers: Record<string, string>, body: string | Buffer): Promise<boolean> {
    const signingKey = this.credentials.webhookSigningKey;
    if (!signingKey) {
      // If no key configured, skip verification (not recommended for production)
      return true;
    }

    const signature = headers['x-clover-signature'] || headers['X-Clover-Signature'];
    if (!signature) {
      return false;
    }

    // Clover webhook signature verification
    const crypto = await import('crypto');
    const bodyString = typeof body === 'string' ? body : body.toString('utf-8');
    const hmac = crypto.createHmac('sha256', signingKey);
    hmac.update(bodyString);
    const expectedSignature = hmac.digest('hex');

    return signature === expectedSignature;
  }

  normalizeWebhook(payload: unknown): CanonicalWebhookEvent {
    const data = payload as CloverWebhookPayload;
    
    // Clover sends webhooks in a specific format with merchant-grouped events
    const merchantIds = Object.keys(data.merchants || {});
    const merchantId = merchantIds[0] || this.credentials.merchantId;
    const events = data.merchants?.[merchantId] || [];
    const event = events[0]; // Process first event

    if (!event) {
      return {
        type: 'unknown',
        provider: 'clover',
        eventId: `clover_${Date.now()}`,
        timestamp: new Date().toISOString(),
        locationId: merchantId,
        raw: data as Record<string, unknown>,
      };
    }

    const eventType = this.mapWebhookEventType(event.type);

    return {
      type: eventType,
      provider: 'clover',
      eventId: `${event.objectId}_${event.ts}`,
      timestamp: new Date(event.ts).toISOString(),
      locationId: merchantId,
      orderId: event.type.startsWith('O:') ? event.objectId : undefined,
      paymentId: event.type.startsWith('P:') ? event.objectId : undefined,
      raw: data as Record<string, unknown>,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Mapping Methods
  // ---------------------------------------------------------------------------

  private mapItemToCanonical(item: CloverItem, _locationId: string): CanonicalCatalogItem {
    const modifierGroups: CanonicalModifierGroup[] = (item.modifierGroups?.elements || []).map(group => ({
      id: group.id,
      externalId: group.id,
      name: group.name,
      required: (group.minRequired ?? 0) > 0,
      minSelections: group.minRequired ?? 0,
      maxSelections: group.maxAllowed ?? 99,
      modifiers: (group.modifiers?.elements || []).map(mod => ({
        id: mod.id,
        name: mod.name,
        priceCents: mod.price ?? 0,
      })),
    }));

    return {
      id: item.id,
      externalId: item.id,
      provider: 'clover',
      name: item.name,
      description: item.alternateName,
      priceCents: item.price,
      currency: 'USD', // Clover prices are in cents
      imageUrl: undefined, // Would need separate API call to get images
      available: item.available !== false && item.hidden !== true,
      modifierGroups: modifierGroups.length > 0 ? modifierGroups : undefined,
    };
  }

  private mapOrderToCanonical(order: CloverOrder): CanonicalOrder {
    const items: CanonicalOrderItem[] = (order.lineItems?.elements || []).map(item => ({
      id: item.id,
      externalId: item.item?.id || item.id,
      name: item.name,
      quantity: Math.round((item.unitQty || 1000) / 1000), // Convert back from Clover's unit system
      unitPriceCents: item.price,
      totalPriceCents: item.price * Math.round((item.unitQty || 1000) / 1000),
      modifiers: (item.modifications?.elements || []).map(mod => ({
        id: mod.modifier?.id || mod.id,
        name: mod.name,
        priceCents: mod.amount ?? 0,
      })),
      notes: item.note,
    }));

    // Determine order status from payments
    const payments = order.payments?.elements || [];
    const hasSuccessfulPayment = payments.some(p => p.result === 'SUCCESS');
    const _isCompleted = order.state === 'locked' && hasSuccessfulPayment; // Reserved for future status mapping

    // Determine source from externalReferenceId
    const isCountrTopOrder = order.externalReferenceId?.startsWith('ct_');
    const source: OrderSource = isCountrTopOrder ? 'countrtop_online' : 'pos';

    // Get customer info if available
    const customer = order.customers?.elements?.[0];
    const customerEmail = customer?.emailAddresses?.elements?.[0]?.emailAddress;
    const customerPhone = customer?.phoneNumbers?.elements?.[0]?.phoneNumber;
    const customerName = customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : undefined;

    return {
      id: order.externalReferenceId || order.id,
      externalId: order.id,
      provider: 'clover',
      locationId: this.credentials.merchantId,
      source,
      status: this.mapOrderStatus(order.state, hasSuccessfulPayment),
      items,
      subtotalCents: order.total - (payments[0]?.taxAmount || 0),
      taxCents: payments[0]?.taxAmount || 0,
      totalCents: order.total,
      currency: order.currency || 'USD',
      createdAt: order.createdTime ? new Date(order.createdTime).toISOString() : new Date().toISOString(),
      updatedAt: order.modifiedTime ? new Date(order.modifiedTime).toISOString() : new Date().toISOString(),
      customerEmail,
      customerPhone,
      customerName: customerName || undefined,
      metadata: {
        cloverOrderId: order.id,
        externalReferenceId: order.externalReferenceId,
      },
      raw: order as unknown as Record<string, unknown>,
    };
  }

  private mapMerchantToLocation(merchant: CloverMerchant): CanonicalLocation {
    return {
      id: merchant.id,
      provider: 'clover',
      name: merchant.name,
      address: merchant.address ? {
        line1: merchant.address.address1,
        line2: merchant.address.address2,
        city: merchant.address.city,
        state: merchant.address.state,
        postalCode: merchant.address.zip,
        country: merchant.address.country,
      } : undefined,
      phone: merchant.phoneNumber,
      timezone: merchant.timezone,
      currency: merchant.defaultCurrency,
      status: 'active',
    };
  }

  private mapOrderStatus(state?: string, hasPaidPayment?: boolean): CanonicalOrderStatus {
    if (state === 'locked' && hasPaidPayment) {
      return 'completed';
    }
    if (hasPaidPayment) {
      return 'paid';
    }
    return 'open';
  }

  private mapWebhookEventType(type: string): WebhookEventType {
    // Clover webhook types: O:CREATE, O:UPDATE, O:DELETE, P:CREATE, P:UPDATE, etc.
    if (type.startsWith('O:CREATE')) return 'order.created';
    if (type.startsWith('O:UPDATE')) return 'order.updated';
    if (type.startsWith('P:CREATE')) return 'payment.created';
    if (type.startsWith('P:UPDATE')) return 'payment.updated';
    return 'unknown';
  }

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  private wrapError(error: unknown, operation: string): POSAdapterError {
    if (error instanceof POSAdapterError) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return new POSAdapterError(
      `Clover ${operation} failed: ${message}`,
      'clover',
      'UNKNOWN',
      500,
      error
    );
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createCloverAdapter(config: POSAdapterConfig): CloverAdapter {
  return new CloverAdapter(config);
}

