import { LoyaltySnapshot, MenuItem, OrderSummary, VendorProfile } from '@countrtop/models';

type ApiConfig = {
  baseUrl?: string;
};

const defaultConfig: Required<ApiConfig> = {
  baseUrl: 'https://api.countrtop.local'
};

const createUrl = (path: string, baseUrl: string) => `${baseUrl}${path}`;

export const fetchFeaturedVendors = async (
  config: ApiConfig = defaultConfig
): Promise<VendorProfile[]> => {
  const response = await fetch(createUrl('/vendors/featured', config.baseUrl ?? defaultConfig.baseUrl));
  if (!response.ok) throw new Error('Failed to load vendors');
  return response.json();
};

export const fetchMenu = async (
  vendorId: string,
  config: ApiConfig = defaultConfig
): Promise<MenuItem[]> => {
  const response = await fetch(
    createUrl(`/vendors/${vendorId}/menu`, config.baseUrl ?? defaultConfig.baseUrl)
  );
  if (!response.ok) throw new Error('Failed to load menu');
  return response.json();
};

export const fetchLoyalty = async (
  userId: string,
  config: ApiConfig = defaultConfig
): Promise<LoyaltySnapshot> => {
  const response = await fetch(
    createUrl(`/users/${userId}/loyalty`, config.baseUrl ?? defaultConfig.baseUrl)
  );
  if (!response.ok) throw new Error('Failed to load loyalty');
  return response.json();
};

export const fetchRecentOrders = async (
  vendorId: string,
  config: ApiConfig = defaultConfig
): Promise<OrderSummary[]> => {
  const response = await fetch(
    createUrl(`/vendors/${vendorId}/orders/recent`, config.baseUrl ?? defaultConfig.baseUrl)
  );
  if (!response.ok) throw new Error('Failed to load orders');
  return response.json();
};
