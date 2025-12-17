export type UserRole = 'guest' | 'customer' | 'vendor' | 'admin';

export type MenuItemOption = {
  id: string;
  name: string;
  priceDelta?: number;
  isDefault?: boolean;
};

export type MenuItem = {
  id: string;
  vendorId: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  category?: string;
  tags?: string[];
  imageUrl?: string;
  isAvailable: boolean;
  options?: MenuItemOption[];
};

export type OrderStatus = 'draft' | 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export type OrderItem = {
  menuItemId: string;
  quantity: number;
  price: number;
  notes?: string;
  selectedOptionIds?: string[];
};

export type Order = {
  id: string;
  vendorId: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  total: number;
  createdAt: string;
  updatedAt?: string;
  etaMinutes?: number;
  note?: string;
};

export type User = {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string;
  phoneNumber?: string;
  photoUrl?: string;
  loyaltyPoints?: number;
  preferredVendorId?: string;
};

export type RewardActivityType = 'earn' | 'redeem';

export type RewardActivity = {
  id: string;
  userId: string;
  vendorId: string;
  points: number;
  type: RewardActivityType;
  description?: string;
  occurredAt: string;
  orderId?: string;
};

export type VendorSettings = {
  vendorId: string;
  currency: string;
  timezone?: string;
  enableLoyalty: boolean;
  loyaltyEarnRate?: number;
  loyaltyRedeemRate?: number;
  allowScheduledOrders?: boolean;
  defaultPrepMinutes?: number;
  menuVersion?: string;
};
