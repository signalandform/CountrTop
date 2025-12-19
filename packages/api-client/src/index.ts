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

export type PaymentIntentPayload = {
  amount: number;
  currency?: string;
  orderId?: string;
  userId?: string;
  vendorId?: string;
  customerId?: string;
  description?: string;
  setupFutureUsage?: 'on_session' | 'off_session';
};

export type PaymentIntentResponse =
  | {
      ok: true;
      mode: 'payment';
      paymentIntentId: string;
      clientSecret: string;
    }
  | { ok: false; error: string };

export type SetupIntentPayload = {
  customerId?: string;
  userId?: string;
  vendorId?: string;
};

export type SetupIntentResponse =
  | {
      ok: true;
      mode: 'setup';
      setupIntentId: string;
      clientSecret: string;
    }
  | { ok: false; error: string };

export type RewardActivityRequest = {
  userId: string;
  vendorId: string;
  points: number;
  type: 'earn' | 'redeem';
  description?: string;
  orderId?: string;
};

export const createPaymentIntent = async (
  payload: PaymentIntentPayload,
  config: ApiConfig = defaultConfig
): Promise<PaymentIntentResponse> => {
  const response = await fetch(createUrl('/payments/checkout', config.baseUrl ?? defaultConfig.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, mode: 'payment' })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    return { ok: false, error: errorBody.error ?? 'Unable to create payment intent' };
  }

  return response.json();
};

export const createSetupIntent = async (
  payload: SetupIntentPayload,
  config: ApiConfig = defaultConfig
): Promise<SetupIntentResponse> => {
  const response = await fetch(createUrl('/payments/checkout', config.baseUrl ?? defaultConfig.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, mode: 'setup' })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    return { ok: false, error: errorBody.error ?? 'Unable to create setup intent' };
  }

  return response.json();
};

export const recordRewardActivity = async (
  payload: RewardActivityRequest,
  config: ApiConfig = defaultConfig
): Promise<{ ok: boolean; error?: string }> => {
  const response = await fetch(createUrl('/loyalty/activities', config.baseUrl ?? defaultConfig.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    return { ok: false, error: errorBody.error ?? 'Failed to record loyalty activity' };
  }

  return response.json();
};
