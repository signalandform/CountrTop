/**
 * POS Adapter Utilities
 * 
 * Helper functions for working with POS adapters in the CountrTop application.
 */

import type { VendorLocation, Vendor, POSProvider } from '@countrtop/models';
import { createAdapter, type POSAdapter, type POSAdapterConfig, type SquareCredentials, type CloverCredentials } from './adapter';

// =============================================================================
// Environment Configuration
// =============================================================================

/**
 * Gets the environment (sandbox vs production) from environment variables
 */
export function getPOSEnvironment(): 'sandbox' | 'production' {
  const value = (process.env.SQUARE_ENVIRONMENT ?? process.env.POS_ENVIRONMENT ?? 'sandbox').toLowerCase();
  return value === 'production' ? 'production' : 'sandbox';
}

// =============================================================================
// Credential Resolution
// =============================================================================

/**
 * Normalizes a credential reference key for environment variable lookup
 */
function normalizeCredentialRef(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}

/**
 * Resolves Square credentials for a vendor
 */
function resolveSquareCredentials(vendor: Vendor): SquareCredentials | null {
  let accessToken: string | null = null;

  // First try vendor-specific token using credential ref
  if (vendor.squareCredentialRef) {
    const refKey = `SQUARE_ACCESS_TOKEN_${normalizeCredentialRef(vendor.squareCredentialRef)}`;
    accessToken = process.env[refKey] ?? null;
  }

  // Fall back to default token
  if (!accessToken) {
    accessToken = process.env.SQUARE_ACCESS_TOKEN ?? null;
  }

  if (!accessToken) {
    return null;
  }

  return {
    provider: 'square',
    accessToken,
    applicationId: process.env.SQUARE_APPLICATION_ID,
    webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
  };
}

/**
 * Resolves Toast credentials for a vendor location (placeholder)
 */
function resolveToastCredentials(_location: VendorLocation): null {
  // TODO: Implement Toast credential resolution
  // Would need: TOAST_CLIENT_ID, TOAST_CLIENT_SECRET, restaurant GUID from location
  return null;
}

/**
 * Resolves Clover credentials for a vendor location
 */
function resolveCloverCredentials(location: VendorLocation): CloverCredentials | null {
  // Try location-specific token first
  const locationKey = location.externalLocationId?.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
  let accessToken = locationKey ? process.env[`CLOVER_ACCESS_TOKEN_${locationKey}`] : null;
  
  // Fall back to default Clover token
  if (!accessToken) {
    accessToken = process.env.CLOVER_ACCESS_TOKEN ?? null;
  }

  if (!accessToken) {
    return null;
  }

  // merchantId is the Clover location ID (stored in externalLocationId)
  const merchantId = location.externalLocationId;
  if (!merchantId) {
    return null;
  }

  return {
    provider: 'clover',
    accessToken,
    merchantId,
    webhookSigningKey: process.env.CLOVER_WEBHOOK_SIGNING_KEY,
  };
}

// =============================================================================
// Adapter Factory Functions
// =============================================================================

/**
 * Creates a POS adapter for a vendor (uses vendor's default location settings)
 * 
 * @deprecated Use getAdapterForLocation() for multi-location support
 */
export function getAdapterForVendor(vendor: Vendor): POSAdapter | null {
  // Legacy support: assume Square provider for vendors
  const credentials = resolveSquareCredentials(vendor);
  if (!credentials) {
    return null;
  }

  const config: POSAdapterConfig = {
    provider: 'square',
    credentials,
    environment: getPOSEnvironment(),
    debug: process.env.POS_DEBUG === 'true',
  };

  return createAdapter(config);
}

/**
 * Creates a POS adapter for a specific vendor location
 * This is the preferred method for multi-POS support
 */
export function getAdapterForLocation(
  location: VendorLocation,
  vendor: Vendor
): POSAdapter | null {
  const provider = location.posProvider ?? 'square';

  let credentials;

  switch (provider) {
    case 'square':
      credentials = resolveSquareCredentials(vendor);
      break;
    case 'toast':
      credentials = resolveToastCredentials(location);
      break;
    case 'clover':
      credentials = resolveCloverCredentials(location);
      break;
    default:
      console.error(`Unknown POS provider: ${provider}`);
      return null;
  }

  if (!credentials) {
    console.error(`No credentials found for ${provider} at location ${location.id}`);
    return null;
  }

  const config: POSAdapterConfig = {
    provider,
    credentials,
    environment: getPOSEnvironment(),
    debug: process.env.POS_DEBUG === 'true',
  };

  return createAdapter(config);
}

/**
 * Determines the POS provider for an order source
 * Used when we need to know which adapter to use for order operations
 */
export function getProviderFromSource(source: string): POSProvider {
  if (source === 'toast_pos') return 'toast';
  if (source === 'clover_pos') return 'clover';
  return 'square'; // Default, includes 'square_pos', 'pos', 'countrtop_online'
}

/**
 * Gets the order source string for a given provider
 */
export function getSourceForProvider(provider: POSProvider, isOnlineOrder: boolean): string {
  if (isOnlineOrder) return 'countrtop_online';
  switch (provider) {
    case 'toast': return 'toast_pos';
    case 'clover': return 'clover_pos';
    default: return 'square_pos';
  }
}

