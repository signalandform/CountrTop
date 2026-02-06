// Import Square client directly to avoid Edge Runtime issues
// This file is only used in API routes, not middleware
import {
  squareClientForVendor as createLegacySquareClient,
  createSquareClientFromOAuthToken
} from '@countrtop/api-client';
import { getSquareClientForVendor } from '@countrtop/data';

import type { DataClient } from '@countrtop/data';
import type { Vendor } from '@countrtop/models';

/**
 * Creates a Square client for a vendor with retry logic and circuit breaker.
 * Prefers OAuth integration; falls back to env-based token for legacy vendors.
 */
export async function getSquareClientForVendorOrLegacy(
  vendor: Vendor,
  dataClient: DataClient
): Promise<ReturnType<typeof createLegacySquareClient>> {
  const oauthClient = await getSquareClientForVendor(vendor.id, dataClient);
  if (oauthClient) {
    return oauthClient as ReturnType<typeof createLegacySquareClient>;
  }
  return createLegacySquareClient(vendor);
}

/**
 * @deprecated Use getSquareClientForVendorOrLegacy for OAuth support
 * Creates a Square client for a vendor with retry logic and circuit breaker.
 * Uses env-based token only (legacy).
 */
export const squareClientForVendor = (vendor: Vendor) => {
  return createLegacySquareClient(vendor);
};

export { createSquareClientFromOAuthToken };
