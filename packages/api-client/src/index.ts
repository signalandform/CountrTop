import { LoyaltyLedgerEntry, OrderSnapshot, PushDevice, Vendor, VendorInsights } from '@countrtop/models';

type ApiConfig = {
  baseUrl?: string;
};

const defaultConfig: Required<ApiConfig> = {
  baseUrl: 'https://api.countrtop.local'
};

const createUrl = (path: string, baseUrl: string) => `${baseUrl}${path}`;

const resolveBaseUrl = (config?: ApiConfig) => config?.baseUrl ?? defaultConfig.baseUrl;

export const fetchVendorBySlug = async (slug: string, config?: ApiConfig): Promise<Vendor> => {
  const response = await fetch(createUrl(`/vendors/${slug}`, resolveBaseUrl(config)));
  if (!response.ok) throw new Error('Failed to load vendor');
  return response.json();
};

export const fetchOrderHistory = async (
  vendorId: string,
  userId: string,
  config?: ApiConfig
): Promise<OrderSnapshot[]> => {
  const response = await fetch(
    createUrl(`/vendors/${vendorId}/orders?userId=${encodeURIComponent(userId)}`, resolveBaseUrl(config))
  );
  if (!response.ok) throw new Error('Failed to load order history');
  return response.json();
};

export const fetchLoyaltyLedger = async (
  vendorId: string,
  userId: string,
  config?: ApiConfig
): Promise<LoyaltyLedgerEntry[]> => {
  const response = await fetch(
    createUrl(`/vendors/${vendorId}/loyalty/${encodeURIComponent(userId)}`, resolveBaseUrl(config))
  );
  if (!response.ok) throw new Error('Failed to load loyalty ledger');
  return response.json();
};

export const fetchInsights = async (
  vendorId: string,
  config?: ApiConfig
): Promise<VendorInsights> => {
  const response = await fetch(createUrl(`/vendors/${vendorId}/insights`, resolveBaseUrl(config)));
  if (!response.ok) throw new Error('Failed to load insights');
  return response.json();
};

export type PushDevicePayload = Omit<PushDevice, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<PushDevice, 'id' | 'createdAt' | 'updatedAt'>>;

export const registerPushDevice = async (
  userId: string,
  payload: PushDevicePayload,
  config?: ApiConfig
): Promise<PushDevice> => {
  const response = await fetch(createUrl(`/users/${userId}/push-devices`, resolveBaseUrl(config)), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Failed to register push device');
  return response.json();
};

// Export logger utilities (always available, Edge Runtime safe)
export { getLogger, createLogger, logger } from './logger';
export type { LogContext, LogLevel } from './logger';

// Export Square client utilities
// Note: These use Square SDK which is not Edge Runtime compatible
// Only import in API routes, not in middleware
export { createResilientSquareClient, squareClientForVendor, getSquareLocation, getSquareOrder, getSquareOrderWithClient, listSquareOrdersUpdatedSince, createSquareClientFromOAuthToken, listSquareLocationsFromIntegration, checkSquarePaymentsActivationWithClient } from './square';
export type { SquareLocationData } from './square';
