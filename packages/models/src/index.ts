export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  isAvailable: boolean;
};

export type VendorProfile = {
  id: string;
  name: string;
  cuisine: string;
  location: string;
  heroImage?: string;
};

export type LoyaltySnapshot = {
  points: number;
  tier: 'bronze' | 'silver' | 'gold';
  nextRewardAt: number;
};

export type OrderSummary = {
  id: string;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  total: number;
  etaMinutes?: number;
};
