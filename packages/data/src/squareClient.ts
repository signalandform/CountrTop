/**
 * Server-only helper to get a Square client for a vendor.
 * Prefers OAuth integration; falls back to env-based token for legacy vendors.
 */
import type { DataClient } from './dataClient';

export async function getSquareClientForVendor(
  vendorId: string,
  dataClient: DataClient
): Promise<unknown> {
  const env =
    (process.env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox') as
      | 'sandbox'
      | 'production';
  const integration = await dataClient.getVendorSquareIntegration(vendorId, env);
  if (integration && integration.squareAccessToken) {
    const { createSquareClientFromOAuthToken } = await import('@countrtop/api-client/square');
    return createSquareClientFromOAuthToken(integration.squareAccessToken, env);
  }
  return null;
}
