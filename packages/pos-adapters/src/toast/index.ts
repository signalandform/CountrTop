/**
 * Toast POS Adapter
 * 
 * Implements the POSAdapter interface for Toast restaurant POS.
 * 
 * Toast API Reference:
 * - Base URL: https://toast-api-server/
 * - Sandbox: https://ws-sandbox-api.toasttab.com/
 * - Production: https://ws-api.toasttab.com/
 * - Auth: OAuth 2.0 client credentials flow
 * 
 * Toast is restaurant-focused POS with strong order management and menu APIs.
 */

import type { POSAdapter, POSAdapterConfig, ToastCredentials } from '../adapter';
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
// Toast API Types
// =============================================================================

type ToastMenuItem = {
  guid: string;
  name: string;
  description?: string;
  price: number;
  plu?: string;
  sku?: string;
  visibility?: string[];
  isDeleted?: boolean;
  isActive?: boolean;
  menuGroup?: { guid: string; name: string };
  modifierGroups?: ToastModifierGroup[];
  image?: string;
};

type ToastModifierGroup = {
  guid: string;
  name: string;
  minSelections?: number;
  maxSelections?: number;
  modifiers?: ToastModifier[];
};

type ToastModifier = {
  guid: string;
  name: string;
  price?: number;
  isDefault?: boolean;
};

type ToastOrder = {
  guid: string;
  entityType: 'Order';
  externalId?: string;
  source: string;
  displayNumber?: string;
  diningOption?: { guid: string; name: string };
  openedDate?: string;
  modifiedDate?: string;
  closedDate?: string;
  voidDate?: string;
  paidDate?: string;
  checks?: ToastCheck[];
  customer?: ToastCustomer;
  voided?: boolean;
  deleted?: boolean;
  curbsidePickupInfo?: {
    notes?: string;
    transportDescription?: string;
    transportColor?: string;
  };
  deliveryInfo?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    notes?: string;
  };
};

type ToastCheck = {
  guid: string;
  displayNumber?: string;
  amount: number;
  taxAmount?: number;
  totalAmount: number;
  selections?: ToastSelection[];
  payments?: ToastPayment[];
  appliedDiscounts?: ToastDiscount[];
  customer?: ToastCustomer;
};

type ToastSelection = {
  guid: string;
  itemGuid?: string;
  displayName: string;
  quantity: number;
  preDiscountPrice: number;
  price: number;
  voided?: boolean;
  modifiers?: ToastSelectionModifier[];
  specialRequest?: string;
};

type ToastSelectionModifier = {
  guid: string;
  displayName: string;
  price: number;
};

type ToastPayment = {
  guid: string;
  paidDate?: string;
  amount: number;
  tipAmount?: number;
  type?: string;
  otherPayment?: { guid: string; name: string };
  refundStatus?: string;
};

type ToastDiscount = {
  guid: string;
  name: string;
  discountAmount: number;
};

type ToastCustomer = {
  guid?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

type ToastRestaurant = {
  guid: string;
  name: string;
  location?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    phone?: string;
  };
  timeZone?: string;
  currencyCode?: string;
};

type ToastWebhookPayload = {
  eventType: string;
  eventTime: string;
  eventId: string;
  restaurantGuid: string;
  data?: {
    orderGuid?: string;
    paymentGuid?: string;
    menuItemGuid?: string;
    [key: string]: unknown;
  };
};

type ToastAuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

// =============================================================================
// TOAST ADAPTER
// =============================================================================

export class ToastAdapter implements POSAdapter {
  readonly provider: POSProvider = 'toast';
  private credentials: ToastCredentials;
  private baseUrl: string;
  private debug: boolean;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: POSAdapterConfig) {
    if (config.credentials.provider !== 'toast') {
      throw new Error('ToastAdapter requires Toast credentials');
    }

    this.credentials = config.credentials;
    this.debug = config.debug ?? false;

    // Set base URL based on environment
    this.baseUrl = config.environment === 'production'
      ? 'https://ws-api.toasttab.com'
      : 'https://ws-sandbox-api.toasttab.com';
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  private async ensureAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    // Get new token via OAuth client credentials flow
    const tokenUrl = `${this.baseUrl}/authentication/v1/authentication/login`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: this.credentials.clientId,
        clientSecret: this.credentials.clientSecret,
        userAccessType: 'TOAST_MACHINE_CLIENT',
      }),
    });

    if (!response.ok) {
      throw new POSAuthenticationError('toast', 'Failed to obtain access token');
    }

    const data: ToastAuthResponse = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);

    return this.accessToken;
  }

  // ---------------------------------------------------------------------------
  // HTTP Client
  // ---------------------------------------------------------------------------

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.ensureAccessToken();
    const url = `${this.baseUrl}${endpoint}`;
    
    if (this.debug) {
      console.log(`[Toast] ${options.method || 'GET'} ${url}`);
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Toast-Restaurant-External-ID': this.credentials.restaurantGuid,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) return {} as T;
    
    return JSON.parse(text);
  }

  private async handleErrorResponse(response: Response): Promise<POSAdapterError> {
    const statusCode = response.status;
    let message = response.statusText;

    try {
      const body = await response.json();
      message = body.message || body.error || body.details || message;
    } catch {
      // Ignore JSON parse errors
    }

    if (statusCode === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return new POSRateLimitError(
        'toast',
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
      );
    }

    if (statusCode === 401 || statusCode === 403) {
      this.accessToken = null; // Clear cached token
      return new POSAuthenticationError('toast', message);
    }

    if (statusCode === 404) {
      return new POSNotFoundError('toast', 'resource', '', new Error(message));
    }

    return new POSAdapterError(message, 'toast', 'API_ERROR', statusCode);
  }

  // ---------------------------------------------------------------------------
  // Catalog Operations
  // ---------------------------------------------------------------------------

  async fetchCatalog(locationId: string): Promise<CanonicalCatalogItem[]> {
    try {
      // Toast menu API endpoint
      const response = await this.fetch<ToastMenuItem[]>(
        `/menus/v2/menus/${locationId}/menuItems`
      );

      const items = response || [];
      return items
        .filter(item => item.isActive !== false && item.isDeleted !== true)
        .filter(item => item.visibility?.includes('ALL') || item.visibility?.includes('ONLINE'))
        .map(item => this.mapItemToCanonical(item, locationId));
    } catch (error) {
      throw this.wrapError(error, 'fetchCatalog');
    }
  }

  async fetchCatalogItem(locationId: string, itemId: string): Promise<CanonicalCatalogItem | null> {
    try {
      const item = await this.fetch<ToastMenuItem>(
        `/menus/v2/menus/${locationId}/menuItems/${itemId}`
      );

      if (!item || item.isDeleted) {
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
      const order = await this.fetch<ToastOrder>(
        `/orders/v2/orders/${orderId}`
      );

      if (!order || order.deleted || order.voided) {
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

  async searchOrders(locationId: string, since: string, _until?: string): Promise<CanonicalOrder[]> {
    try {
      const sinceDate = new Date(since).toISOString();
      // Note: Toast bulk order API uses businessDate, not a date range
      // const untilDate = until ? new Date(until).toISOString() : new Date().toISOString();

      // Toast uses businessDate format YYYYMMDD for some queries
      const businessDate = sinceDate.split('T')[0].replace(/-/g, '');

      const response = await this.fetch<ToastOrder[]>(
        `/orders/v2/ordersBulk?businessDate=${businessDate}&restaurantIds=${locationId}`
      );

      const orders = response || [];
      return orders
        .filter(order => !order.deleted && !order.voided)
        .map(order => this.mapOrderToCanonical(order));
    } catch (error) {
      throw this.wrapError(error, 'searchOrders');
    }
  }

  // ---------------------------------------------------------------------------
  // Checkout Operations
  // ---------------------------------------------------------------------------

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    try {
      // Toast online ordering typically uses their native online ordering platform
      // For integration, we create an order that will be paid via Toast's system
      
      const selections = input.items.map(item => ({
        itemGuid: item.catalogItemId,
        quantity: item.quantity,
        specialRequest: item.note,
        modifiers: item.modifiers?.map(mod => ({
          guid: mod.id,
        })),
      }));

      // Create order via Toast API
      const orderResponse = await this.fetch<ToastOrder>('/orders/v2/orders', {
        method: 'POST',
        body: JSON.stringify({
          entityType: 'Order',
          externalId: input.metadata?.ct_reference_id || `ct_${Date.now()}`,
          source: 'CountrTop',
          diningOption: {
            behavior: 'TAKE_OUT',
          },
          customer: {
            firstName: input.customerName?.split(' ')[0],
            lastName: input.customerName?.split(' ').slice(1).join(' '),
            email: input.customerEmail,
            phone: input.customerPhone,
          },
          checks: [{
            selections,
          }],
        }),
      });

      const orderId = orderResponse.guid;

      // Toast typically handles payment through their own system
      // For online orders, return a redirect to Toast's payment page
      // Note: Actual implementation depends on Toast Online Ordering setup
      const checkoutUrl = `https://www.toasttab.com/checkout/${this.credentials.restaurantGuid}/${orderId}?redirect=${encodeURIComponent(input.redirectUrl)}`;

      return {
        checkoutUrl,
        orderId,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
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
      // Toast typically returns restaurant info for the configured restaurant
      const restaurant = await this.fetch<ToastRestaurant>(
        `/restaurants/v1/restaurants/${this.credentials.restaurantGuid}`
      );

      return [this.mapRestaurantToLocation(restaurant)];
    } catch (error) {
      throw this.wrapError(error, 'fetchLocations');
    }
  }

  async fetchLocation(locationId: string): Promise<CanonicalLocation | null> {
    try {
      if (locationId !== this.credentials.restaurantGuid) {
        return null;
      }

      const restaurant = await this.fetch<ToastRestaurant>(
        `/restaurants/v1/restaurants/${locationId}`
      );
      return this.mapRestaurantToLocation(restaurant);
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
    const signingKey = this.credentials.webhookSecret;
    if (!signingKey) {
      return true;
    }

    const signature = headers['toast-signature'] || headers['Toast-Signature'];
    if (!signature) {
      return false;
    }

    // Toast webhook signature verification
    const crypto = await import('crypto');
    const bodyString = typeof body === 'string' ? body : body.toString('utf-8');
    const hmac = crypto.createHmac('sha256', signingKey);
    hmac.update(bodyString);
    const expectedSignature = hmac.digest('base64');

    return signature === expectedSignature;
  }

  normalizeWebhook(payload: unknown): CanonicalWebhookEvent {
    const data = payload as ToastWebhookPayload;
    
    const eventType = this.mapWebhookEventType(data.eventType);

    return {
      type: eventType,
      provider: 'toast',
      eventId: data.eventId || `toast_${Date.now()}`,
      timestamp: data.eventTime || new Date().toISOString(),
      locationId: data.restaurantGuid,
      orderId: data.data?.orderGuid,
      paymentId: data.data?.paymentGuid,
      raw: data as Record<string, unknown>,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Mapping Methods
  // ---------------------------------------------------------------------------

  private mapItemToCanonical(item: ToastMenuItem, _locationId: string): CanonicalCatalogItem {
    const modifierGroups: CanonicalModifierGroup[] = (item.modifierGroups || []).map(group => ({
      id: group.guid,
      externalId: group.guid,
      name: group.name,
      required: (group.minSelections ?? 0) > 0,
      minSelections: group.minSelections ?? 0,
      maxSelections: group.maxSelections ?? 99,
      modifiers: (group.modifiers || []).map(mod => ({
        id: mod.guid,
        name: mod.name,
        priceCents: Math.round((mod.price ?? 0) * 100),
        isDefault: mod.isDefault,
      })),
    }));

    return {
      id: item.guid,
      externalId: item.guid,
      provider: 'toast',
      name: item.name,
      description: item.description,
      priceCents: Math.round(item.price * 100), // Toast prices in dollars
      currency: 'USD',
      imageUrl: item.image,
      available: item.isActive !== false,
      modifierGroups: modifierGroups.length > 0 ? modifierGroups : undefined,
    };
  }

  private mapOrderToCanonical(order: ToastOrder): CanonicalOrder {
    const check = order.checks?.[0];
    const items: CanonicalOrderItem[] = (check?.selections || [])
      .filter(sel => !sel.voided)
      .map(sel => ({
        id: sel.guid,
        externalId: sel.itemGuid || sel.guid,
        name: sel.displayName,
        quantity: sel.quantity,
        unitPriceCents: Math.round(sel.preDiscountPrice * 100 / sel.quantity),
        totalPriceCents: Math.round(sel.price * 100),
        modifiers: (sel.modifiers || []).map(mod => ({
          id: mod.guid,
          name: mod.displayName,
          priceCents: Math.round(mod.price * 100),
        })),
        notes: sel.specialRequest,
      }));

    // Determine order status
    const hasPaid = check?.payments?.some(p => p.paidDate);
    const _isCompleted = !!order.closedDate && hasPaid; // Reserved for future status mapping

    // Determine source from order.source field
    const isCountrTopOrder = order.externalId?.startsWith('ct_') || order.source === 'CountrTop';
    const source: OrderSource = isCountrTopOrder ? 'countrtop_online' : 'pos';

    // Get customer info
    const customer = order.customer || check?.customer;
    const customerName = customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : undefined;

    return {
      id: order.externalId || order.guid,
      externalId: order.guid,
      provider: 'toast',
      locationId: this.credentials.restaurantGuid,
      source,
      status: this.mapOrderStatus(order, hasPaid),
      items,
      subtotalCents: Math.round((check?.amount ?? 0) * 100),
      taxCents: Math.round((check?.taxAmount ?? 0) * 100),
      totalCents: Math.round((check?.totalAmount ?? 0) * 100),
      currency: 'USD',
      createdAt: order.openedDate || new Date().toISOString(),
      updatedAt: order.modifiedDate || new Date().toISOString(),
      customerEmail: customer?.email,
      customerPhone: customer?.phone,
      customerName: customerName || undefined,
      displayNumber: order.displayNumber,
      metadata: {
        toastOrderGuid: order.guid,
        externalId: order.externalId,
        diningOption: order.diningOption?.name,
        curbsideInfo: order.curbsidePickupInfo,
        deliveryInfo: order.deliveryInfo,
      },
      raw: order as unknown as Record<string, unknown>,
    };
  }

  private mapRestaurantToLocation(restaurant: ToastRestaurant): CanonicalLocation {
    return {
      id: restaurant.guid,
      provider: 'toast',
      name: restaurant.name,
      address: restaurant.location ? {
        line1: restaurant.location.address1,
        line2: restaurant.location.address2,
        city: restaurant.location.city,
        state: restaurant.location.state,
        postalCode: restaurant.location.zipCode,
        country: restaurant.location.country,
      } : undefined,
      phone: restaurant.location?.phone,
      timezone: restaurant.timeZone,
      currency: restaurant.currencyCode,
      status: 'active',
    };
  }

  private mapOrderStatus(order: ToastOrder, hasPaid?: boolean): CanonicalOrderStatus {
    if (order.voided || order.deleted) {
      return 'cancelled';
    }
    if (order.closedDate && hasPaid) {
      return 'completed';
    }
    if (hasPaid) {
      return 'paid';
    }
    return 'open';
  }

  private mapWebhookEventType(type: string): WebhookEventType {
    // Toast webhook event types
    const typeUpper = type.toUpperCase();
    if (typeUpper.includes('ORDER') && typeUpper.includes('CREATE')) return 'order.created';
    if (typeUpper.includes('ORDER') && typeUpper.includes('UPDATE')) return 'order.updated';
    if (typeUpper.includes('ORDER') && typeUpper.includes('COMPLETE')) return 'order.completed';
    if (typeUpper.includes('PAYMENT') && typeUpper.includes('CREATE')) return 'payment.created';
    if (typeUpper.includes('PAYMENT') && typeUpper.includes('UPDATE')) return 'payment.updated';
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
      `Toast ${operation} failed: ${message}`,
      'toast',
      'UNKNOWN',
      500,
      error
    );
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createToastAdapter(config: POSAdapterConfig): ToastAdapter {
  return new ToastAdapter(config);
}

