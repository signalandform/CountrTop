import { squareClientForVendor as createSquareClient } from '@countrtop/api-client';

import { Vendor } from '@countrtop/models';

/**
 * Creates a Square client for a vendor with retry logic and circuit breaker.
 * Uses the resilient Square client from @countrtop/api-client.
 */
export const squareClientForVendor = (vendor: Vendor) => {
  return createSquareClient(vendor);
};
