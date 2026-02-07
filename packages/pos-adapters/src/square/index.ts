/**
 * Square POS Adapter
 * 
 * Implements the POSAdapter interface for Square.
 */

import { Client, Environment } from 'square/legacy';
import type { 
  Order as SquareOrderType,
  CatalogObject,
  Location as SquareLocationType,
} from 'square/legacy';

import type { POSAdapter, POSAdapterConfig, SquareCredentials } from '../adapter';
import {
  POSAdapterError,
  POSAuthenticationError,
  POSNotFoundError,
  POSRateLimitError,
  type POSProvider,
  type CanonicalCatalogItem,
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
// SQUARE ADAPTER
// =============================================================================

export class SquareAdapter implements POSAdapter {
  readonly provider: POSProvider = 'square';
  private client: Client;
  private credentials: SquareCredentials;
  private debug: boolean;

  constructor(config: POSAdapterConfig) {
    if (config.credentials.provider !== 'square') {
      throw new Error('SquareAdapter requires Square credentials');
    }

    this.credentials = config.credentials;
    this.debug = config.debug ?? false;

    this.client = new Client({
      bearerAuthCredentials: {
        accessToken: this.credentials.accessToken,
      },
      environment: config.environment === 'production' 
        ? Environment.Production 
        : Environment.Sandbox,
    });
  }

  // ---------------------------------------------------------------------------
  // Catalog Operations
  // ---------------------------------------------------------------------------

  async fetchCatalog(locationId: string): Promise<CanonicalCatalogItem[]> {
    try {
      const items: CanonicalCatalogItem[] = [];
      let cursor: string | undefined;

      do {
        const { result } = await this.client.catalogApi.listCatalog(
          cursor,
          'ITEM'
        );

        if (result.objects) {
          for (const obj of result.objects) {
            const canonicalItems = this.mapCatalogObjectToCanonical(obj, locationId);
            items.push(...canonicalItems);
          }
        }

        cursor = result.cursor ?? undefined;
      } while (cursor);

      return items;
    } catch (error) {
      throw this.wrapError(error, 'fetchCatalog');
    }
  }

  async fetchCatalogItem(locationId: string, itemId: string): Promise<CanonicalCatalogItem | null> {
    try {
      const { result } = await this.client.catalogApi.retrieveCatalogObject(
        itemId,
        true // include related objects
      );

      if (!result.object) {
        return null;
      }

      const items = this.mapCatalogObjectToCanonical(result.object, locationId);
      return items[0] ?? null;
    } catch (error) {
      if (this.isNotFoundError(error)) {
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
      const { result } = await this.client.ordersApi.retrieveOrder(orderId);

      if (!result.order) {
        return null;
      }

      return this.mapOrderToCanonical(result.order);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw this.wrapError(error, 'fetchOrder');
    }
  }

  async searchOrders(locationId: string, since: string, until?: string): Promise<CanonicalOrder[]> {
    try {
      const orders: CanonicalOrder[] = [];
      let cursor: string | undefined;

      do {
        const { result } = await this.client.ordersApi.searchOrders({
          locationIds: [locationId],
          query: {
            filter: {
              dateTimeFilter: {
                updatedAt: {
                  startAt: since,
                  endAt: until ?? new Date().toISOString(),
                },
              },
            },
            sort: {
              sortField: 'UPDATED_AT',
              sortOrder: 'DESC',
            },
          },
          cursor,
        });

        if (result.orders) {
          for (const order of result.orders) {
            orders.push(this.mapOrderToCanonical(order));
          }
        }

        cursor = result.cursor ?? undefined;
      } while (cursor);

      return orders;
    } catch (error) {
      throw this.wrapError(error, 'searchOrders');
    }
  }

  // ---------------------------------------------------------------------------
  // Checkout Operations
  // ---------------------------------------------------------------------------

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    try {
      const lineItems = input.items.map(item => ({
        quantity: String(item.quantity),
        catalogObjectId: item.variationId ?? item.catalogItemId,
        modifiers: item.modifiers?.map(m => ({ catalogObjectId: m.id })),
        note: item.note,
      }));

      const { result } = await this.client.checkoutApi.createPaymentLink({
        idempotencyKey: `ct_checkout_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        order: {
          locationId: input.locationId,
          lineItems,
          metadata: input.metadata ? 
            Object.fromEntries(
              Object.entries(input.metadata).map(([k, v]) => [k, String(v)])
            ) : undefined,
        },
        checkoutOptions: {
          redirectUrl: input.redirectUrl,
          askForShippingAddress: false,
        },
        prePopulatedData: {
          buyerEmail: input.customerEmail,
          buyerPhoneNumber: input.customerPhone,
        },
      });

      if (!result.paymentLink) {
        throw new POSAdapterError(
          'Failed to create payment link',
          'square',
          'CHECKOUT_FAILED'
        );
      }

      return {
        checkoutUrl: result.paymentLink.url ?? '',
        orderId: result.paymentLink.orderId ?? '',
        expiresAt: result.paymentLink.createdAt, // Square links don't expire easily
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
      const { result } = await this.client.locationsApi.listLocations();

      if (!result.locations) {
        return [];
      }

      return result.locations.map(loc => this.mapLocationToCanonical(loc));
    } catch (error) {
      throw this.wrapError(error, 'fetchLocations');
    }
  }

  async fetchLocation(locationId: string): Promise<CanonicalLocation | null> {
    try {
      const { result } = await this.client.locationsApi.retrieveLocation(locationId);

      if (!result.location) {
        return null;
      }

      return this.mapLocationToCanonical(result.location);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw this.wrapError(error, 'fetchLocation');
    }
  }

  // ---------------------------------------------------------------------------
  // Webhook Operations
  // ---------------------------------------------------------------------------

  async verifyWebhook(headers: Record<string, string>, body: string | Buffer): Promise<boolean> {
    const signatureKey = this.credentials.webhookSignatureKey;
    if (!signatureKey) {
      // If no key configured, skip verification (not recommended for production)
      return true;
    }

    const signature = headers['x-square-hmacsha256-signature'] || headers['x-square-signature'];
    if (!signature) {
      return false;
    }

    // Square webhook verification
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', signatureKey);
    const bodyString = typeof body === 'string' ? body : body.toString('utf-8');
    
    // Square includes the URL in the signature
    const notificationUrl = headers['x-square-notification-url'] || '';
    hmac.update(notificationUrl + bodyString);
    
    const expectedSignature = hmac.digest('base64');
    return signature === expectedSignature;
  }

  normalizeWebhook(payload: unknown): CanonicalWebhookEvent {
    const data = payload as Record<string, unknown>;
    const eventType = this.mapWebhookEventType(data.type as string);
    
    // Extract order data if present
    let order: CanonicalOrder | undefined;
    const dataObject = data.data as Record<string, unknown> | undefined;
    const orderData = dataObject?.object as Record<string, unknown> | undefined;
    
    if (orderData?.order) {
      order = this.mapOrderToCanonical(orderData.order as SquareOrderType);
    }

    return {
      type: eventType,
      provider: 'square',
      eventId: data.event_id as string || `sq_${Date.now()}`,
      timestamp: data.created_at as string || new Date().toISOString(),
      locationId: (orderData?.order as Record<string, unknown>)?.location_id as string || '',
      orderId: (orderData?.order as Record<string, unknown>)?.id as string,
      order,
      raw: data,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Mapping Methods
  // ---------------------------------------------------------------------------

  private mapCatalogObjectToCanonical(obj: CatalogObject, locationId: string): CanonicalCatalogItem[] {
    const items: CanonicalCatalogItem[] = [];
    const itemData = obj.itemData;

    if (!itemData?.variations) {
      return items;
    }

    for (const variation of itemData.variations) {
      const varData = variation.itemVariationData;
      if (!varData) continue;

      // Check if available at this location
      const locationOverrides = varData.locationOverrides;
      const isAvailable = !locationOverrides?.some(
        override => override.locationId === locationId && override.soldOut
      );

      items.push({
        id: `${obj.id}_${variation.id}`,
        externalId: obj.id ?? '',
        variationId: variation.id ?? '',
        provider: 'square',
        name: varData.name 
          ? `${itemData.name} - ${varData.name}`
          : itemData.name ?? 'Unknown Item',
        description: itemData.description ?? undefined,
        priceCents: Number(varData.priceMoney?.amount ?? 0),
        currency: varData.priceMoney?.currency ?? 'USD',
        imageUrl: itemData.imageIds?.[0] ? undefined : undefined, // Would need separate API call
        available: isAvailable,
      });
    }

    return items;
  }

  private mapOrderToCanonical(order: SquareOrderType): CanonicalOrder {
    const items: CanonicalOrderItem[] = (order.lineItems ?? []).map(item => ({
      id: item.uid ?? '',
      externalId: item.catalogObjectId ?? item.uid ?? '',
      name: item.name ?? 'Unknown Item',
      quantity: parseInt(item.quantity ?? '1', 10),
      unitPriceCents: Number(item.basePriceMoney?.amount ?? 0),
      totalPriceCents: Number(item.totalMoney?.amount ?? 0),
      modifiers: (item.modifiers ?? []).map(m => ({
        id: m.catalogObjectId ?? m.uid ?? '',
        name: m.name ?? '',
        priceCents: Number(m.basePriceMoney?.amount ?? 0),
      })),
      notes: item.note ?? undefined,
    }));

    // Determine source from metadata or reference_id
    const metadata = order.metadata ?? {};
    const isCountrTopOrder = metadata.ct_source === 'countrtop' || 
      order.referenceId?.startsWith('ct_');
    
    const source: OrderSource = isCountrTopOrder ? 'countrtop_online' : 'pos';

    return {
      id: metadata.ct_reference_id as string || order.referenceId || order.id || '',
      externalId: order.id ?? '',
      provider: 'square',
      locationId: order.locationId ?? '',
      source,
      status: this.mapOrderStatus(order.state),
      items,
      subtotalCents: Number(order.netAmountDueMoney?.amount ?? 0),
      taxCents: Number(order.totalTaxMoney?.amount ?? 0),
      totalCents: Number(order.totalMoney?.amount ?? 0),
      currency: order.totalMoney?.currency ?? 'USD',
      createdAt: order.createdAt ?? new Date().toISOString(),
      updatedAt: order.updatedAt ?? new Date().toISOString(),
      customerEmail: undefined, // Would need customer API call
      customerPhone: undefined,
      customerName: undefined,
      fulfillmentType: this.mapFulfillmentType(order.fulfillments?.[0]),
      metadata: order.metadata ?? undefined,
      raw: order as unknown as Record<string, unknown>,
    };
  }

  private mapLocationToCanonical(location: SquareLocationType): CanonicalLocation {
    return {
      id: location.id ?? '',
      provider: 'square',
      name: location.name ?? 'Unknown Location',
      address: location.address ? {
        line1: location.address.addressLine1 ?? undefined,
        line2: location.address.addressLine2 ?? undefined,
        city: location.address.locality ?? undefined,
        state: location.address.administrativeDistrictLevel1 ?? undefined,
        postalCode: location.address.postalCode ?? undefined,
        country: location.address.country ?? undefined,
      } : undefined,
      phone: location.phoneNumber ?? undefined,
      timezone: location.timezone ?? undefined,
      currency: location.currency ?? undefined,
      status: location.status === 'ACTIVE' ? 'active' : 'inactive',
    };
  }

  private mapOrderStatus(state?: string): CanonicalOrderStatus {
    switch (state) {
      case 'OPEN':
        return 'open';
      case 'COMPLETED':
        return 'completed';
      case 'CANCELED':
        return 'canceled';
      default:
        return 'paid'; // Square marks as COMPLETED after payment
    }
  }

  private mapFulfillmentType(fulfillment?: { type?: string }): 'pickup' | 'delivery' | 'dine_in' | undefined {
    switch (fulfillment?.type) {
      case 'PICKUP':
        return 'pickup';
      case 'DELIVERY':
        return 'delivery';
      case 'DINE_IN':
        return 'dine_in';
      default:
        return undefined;
    }
  }

  private mapWebhookEventType(type?: string): WebhookEventType {
    switch (type) {
      case 'order.created':
        return 'order.created';
      case 'order.updated':
        return 'order.updated';
      case 'order.fulfillment.updated':
        return 'order.updated';
      case 'payment.created':
        return 'payment.created';
      case 'payment.updated':
        return 'payment.updated';
      default:
        return 'unknown';
    }
  }

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  private isNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return (error as { statusCode: number }).statusCode === 404;
    }
    return false;
  }

  private wrapError(error: unknown, operation: string): POSAdapterError {
    if (error instanceof POSAdapterError) {
      return error;
    }

    const err = error as { statusCode?: number; message?: string; errors?: Array<{ code?: string }> };
    const statusCode = err.statusCode ?? 500;
    const message = err.message ?? 'Unknown error';

    if (statusCode === 429) {
      return new POSRateLimitError('square', undefined, error);
    }

    if (statusCode === 401 || statusCode === 403) {
      return new POSAuthenticationError('square', message, error);
    }

    if (statusCode === 404) {
      return new POSNotFoundError('square', operation, '', error);
    }

    return new POSAdapterError(
      `Square ${operation} failed: ${message}`,
      'square',
      err.errors?.[0]?.code ?? 'UNKNOWN',
      statusCode,
      error
    );
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createSquareAdapter(config: POSAdapterConfig): SquareAdapter {
  return new SquareAdapter(config);
}

