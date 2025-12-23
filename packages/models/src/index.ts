export type AuthProvider = 'apple' | 'google';

export type VendorStatus = 'active' | 'inactive';

export type Vendor = {
  id: string;
  slug: string;
  displayName: string;
  squareLocationId: string;
  squareCredentialRef?: string;
  status?: VendorStatus;
};

export type User = {
  id: string;
  provider: AuthProvider;
  providerUserId: string;
  displayName?: string;
};

export type OrderSnapshot = {
  id: string;
  vendorId: string;
  userId?: string | null;
  squareOrderId: string;
  placedAt: string;
  snapshotJson: Record<string, unknown>;
};

export type LoyaltyLedgerEntry = {
  id: string;
  vendorId: string;
  userId: string;
  orderId: string;
  pointsDelta: number;
  createdAt: string;
};

export type PushPlatform = 'ios' | 'android' | 'web';

export type PushDevice = {
  id: string;
  userId: string;
  deviceToken: string;
  platform: PushPlatform;
  createdAt: string;
  updatedAt?: string | null;
};

export type VendorInsights = {
  orders: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  pointsIssued: number;
  topReorderedItems: { label: string; count: number }[];
};
