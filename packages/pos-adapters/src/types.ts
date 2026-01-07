/**
 * POS Adapter Types
 * 
 * These are the canonical, POS-agnostic types used throughout CountrTop.
 * Each POS adapter is responsible for transforming its native types to/from these.
 */

// =============================================================================
// CORE TYPES
// =============================================================================

export type POSProvider = 'square' | 'toast' | 'clover';

export type OrderSource = 
  | 'countrtop_online'  // Order placed through CountrTop customer web/mobile
  | 'pos';              // Order placed directly at POS terminal

// =============================================================================
// CATALOG TYPES
// =============================================================================

export type CanonicalModifier = {
  id: string;
  name: string;
  priceCents: number;
};

export type CanonicalCatalogItem = {
  id: string;                    // CountrTop internal ID
  externalId: string;            // POS-specific item ID
  variationId?: string;          // POS-specific variation ID (Square has this)
  provider: POSProvider;
  name: string;
  description?: string;
  priceCents: number;
  currency: string;
  imageUrl?: string;
  available: boolean;
  modifierGroups?: CanonicalModifierGroup[];
};

export type CanonicalModifierGroup = {
  id: string;
  externalId: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: CanonicalModifier[];
};

// =============================================================================
// ORDER TYPES
// =============================================================================

export type CanonicalOrderItem = {
  id: string;
  externalId: string;            // POS line item ID
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  modifiers: CanonicalModifier[];
  notes?: string;
};

export type CanonicalOrderStatus = 
  | 'open'       // Order created, not yet paid
  | 'paid'       // Payment completed
  | 'completed'  // Order fulfilled/picked up
  | 'canceled';  // Order canceled/refunded

export type CanonicalOrder = {
  id: string;                    // CountrTop internal ID (ct_reference_id)
  externalId: string;            // POS-specific order ID
  provider: POSProvider;
  locationId: string;            // POS location ID
  source: OrderSource;
  status: CanonicalOrderStatus;
  items: CanonicalOrderItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  fulfillmentType?: 'pickup' | 'delivery' | 'dine_in';
  scheduledPickupAt?: string;    // ISO timestamp for scheduled orders
  metadata?: Record<string, unknown>;
  raw?: Record<string, unknown>; // Original POS payload for debugging
};

// =============================================================================
// CHECKOUT TYPES
// =============================================================================

export type CheckoutInput = {
  locationId: string;
  items: Array<{
    catalogItemId: string;       // CountrTop or POS item ID
    variationId?: string;        // For Square
    quantity: number;
    modifiers?: Array<{ id: string }>;
    note?: string;
  }>;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  fulfillmentType?: 'pickup' | 'delivery';
  scheduledPickupAt?: string;
  redirectUrl: string;           // Where to redirect after payment
  metadata?: Record<string, unknown>;
};

export type CheckoutResult = {
  checkoutUrl: string;           // URL to redirect customer for payment
  orderId: string;               // POS order ID (created during checkout)
  expiresAt?: string;            // When the checkout link expires
};

// =============================================================================
// WEBHOOK TYPES
// =============================================================================

export type WebhookEventType = 
  | 'order.created'
  | 'order.updated'
  | 'order.paid'
  | 'order.completed'
  | 'order.canceled'
  | 'payment.created'
  | 'payment.updated'
  | 'unknown';

export type CanonicalWebhookEvent = {
  type: WebhookEventType;
  provider: POSProvider;
  eventId: string;               // Unique event ID for idempotency
  timestamp: string;             // ISO timestamp
  locationId: string;
  orderId?: string;              // POS order ID
  paymentId?: string;            // POS payment ID
  order?: CanonicalOrder;        // Full order data if available
  raw: Record<string, unknown>;  // Original webhook payload
};

// =============================================================================
// LOCATION TYPES
// =============================================================================

export type CanonicalLocation = {
  id: string;                    // POS location ID
  provider: POSProvider;
  name: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  phone?: string;
  timezone?: string;
  currency?: string;
  status: 'active' | 'inactive';
};

// =============================================================================
// ERROR TYPES
// =============================================================================

export class POSAdapterError extends Error {
  constructor(
    message: string,
    public provider: POSProvider,
    public code: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'POSAdapterError';
  }
}

export class POSRateLimitError extends POSAdapterError {
  constructor(
    provider: POSProvider,
    public retryAfterMs?: number,
    originalError?: unknown
  ) {
    super('Rate limit exceeded', provider, 'RATE_LIMIT', 429, originalError);
    this.name = 'POSRateLimitError';
  }
}

export class POSAuthenticationError extends POSAdapterError {
  constructor(provider: POSProvider, message?: string, originalError?: unknown) {
    super(message || 'Authentication failed', provider, 'AUTH_FAILED', 401, originalError);
    this.name = 'POSAuthenticationError';
  }
}

export class POSNotFoundError extends POSAdapterError {
  constructor(provider: POSProvider, resource: string, id: string, originalError?: unknown) {
    super(`${resource} not found: ${id}`, provider, 'NOT_FOUND', 404, originalError);
    this.name = 'POSNotFoundError';
  }
}

