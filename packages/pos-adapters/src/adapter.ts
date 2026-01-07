/**
 * POS Adapter Interface
 * 
 * This is the contract that all POS adapters must implement.
 * Each POS system (Square, Toast, Clover) will have its own adapter
 * that transforms its native API to this unified interface.
 */

import type {
  POSProvider,
  CanonicalCatalogItem,
  CanonicalOrder,
  CanonicalLocation,
  CanonicalWebhookEvent,
  CheckoutInput,
  CheckoutResult,
} from './types';

// =============================================================================
// ADAPTER INTERFACE
// =============================================================================

export interface POSAdapter {
  /**
   * The POS provider this adapter handles
   */
  readonly provider: POSProvider;

  // ---------------------------------------------------------------------------
  // Catalog Operations
  // ---------------------------------------------------------------------------

  /**
   * Fetch all catalog items for a location
   * @param locationId - POS location ID
   * @returns Array of canonical catalog items
   */
  fetchCatalog(locationId: string): Promise<CanonicalCatalogItem[]>;

  /**
   * Fetch a single catalog item
   * @param locationId - POS location ID
   * @param itemId - POS item ID
   * @returns Canonical catalog item or null if not found
   */
  fetchCatalogItem(locationId: string, itemId: string): Promise<CanonicalCatalogItem | null>;

  // ---------------------------------------------------------------------------
  // Order Operations
  // ---------------------------------------------------------------------------

  /**
   * Fetch an order by its POS ID
   * @param orderId - POS order ID
   * @returns Canonical order or null if not found
   */
  fetchOrder(orderId: string): Promise<CanonicalOrder | null>;

  /**
   * Search for orders within a time range
   * @param locationId - POS location ID
   * @param since - ISO timestamp to search from
   * @param until - Optional ISO timestamp to search until (defaults to now)
   * @returns Array of canonical orders
   */
  searchOrders(locationId: string, since: string, until?: string): Promise<CanonicalOrder[]>;

  // ---------------------------------------------------------------------------
  // Checkout Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a checkout session for online ordering
   * @param input - Checkout input with items and customer info
   * @returns Checkout result with payment URL
   */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;

  // ---------------------------------------------------------------------------
  // Location Operations
  // ---------------------------------------------------------------------------

  /**
   * Fetch all locations for the merchant
   * @returns Array of canonical locations
   */
  fetchLocations(): Promise<CanonicalLocation[]>;

  /**
   * Fetch a single location by ID
   * @param locationId - POS location ID
   * @returns Canonical location or null if not found
   */
  fetchLocation(locationId: string): Promise<CanonicalLocation | null>;

  // ---------------------------------------------------------------------------
  // Webhook Operations
  // ---------------------------------------------------------------------------

  /**
   * Verify a webhook signature
   * @param headers - Request headers
   * @param body - Raw request body (string or buffer)
   * @param signature - Webhook signature from headers
   * @returns True if signature is valid
   */
  verifyWebhook(headers: Record<string, string>, body: string | Buffer): Promise<boolean>;

  /**
   * Normalize a webhook payload to canonical format
   * @param payload - Raw webhook payload (already parsed JSON)
   * @returns Canonical webhook event
   */
  normalizeWebhook(payload: unknown): CanonicalWebhookEvent;
}

// =============================================================================
// ADAPTER CONFIG
// =============================================================================

export type POSAdapterConfig = {
  /**
   * POS provider type
   */
  provider: POSProvider;

  /**
   * Credentials for API authentication
   * Structure varies by provider
   */
  credentials: POSCredentials;

  /**
   * Optional: Override API environment (sandbox vs production)
   */
  environment?: 'sandbox' | 'production';

  /**
   * Optional: Enable debug logging
   */
  debug?: boolean;
};

export type POSCredentials = 
  | SquareCredentials 
  | ToastCredentials 
  | CloverCredentials;

export type SquareCredentials = {
  provider: 'square';
  accessToken: string;
  applicationId?: string;
  webhookSignatureKey?: string;
};

export type ToastCredentials = {
  provider: 'toast';
  clientId: string;
  clientSecret: string;
  restaurantGuid: string;
  webhookSecret?: string;
};

export type CloverCredentials = {
  provider: 'clover';
  accessToken: string;
  merchantId: string;
  webhookSigningKey?: string;
};

// =============================================================================
// ADAPTER FACTORY
// =============================================================================

/**
 * Adapter factory type - each POS module exports a factory function
 */
export type POSAdapterFactory = (config: POSAdapterConfig) => POSAdapter;

/**
 * Registry of adapter factories by provider
 */
const adapterFactories = new Map<POSProvider, POSAdapterFactory>();

/**
 * Register an adapter factory
 */
export function registerAdapter(provider: POSProvider, factory: POSAdapterFactory): void {
  adapterFactories.set(provider, factory);
}

/**
 * Create an adapter for a specific provider
 */
export function createAdapter(config: POSAdapterConfig): POSAdapter {
  const factory = adapterFactories.get(config.provider);
  if (!factory) {
    throw new Error(`No adapter registered for provider: ${config.provider}`);
  }
  return factory(config);
}

/**
 * Check if an adapter is registered for a provider
 */
export function hasAdapter(provider: POSProvider): boolean {
  return adapterFactories.has(provider);
}

