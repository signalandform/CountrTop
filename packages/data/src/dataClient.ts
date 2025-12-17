import {
  MenuItem,
  Order,
  OrderStatus,
  RewardActivity,
  RewardActivityInput,
  User,
  VendorSettings
} from './models';

export type Subscription = {
  unsubscribe: () => Promise<void> | void;
};

export type CreateOrderInput = Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'status'> &
  Partial<Pick<Order, 'id' | 'createdAt' | 'updatedAt' | 'status'>>;

export type MenuItemInput = Omit<MenuItem, 'id'> & { id?: string };

export interface DataClient {
  signInWithEmail(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<User | null>;

  getMenuItems(vendorId: string): Promise<MenuItem[]>;
  upsertMenuItem(menuItem: MenuItemInput): Promise<MenuItem>;
  deleteMenuItem(menuItemId: string): Promise<void>;

  createOrder(order: CreateOrderInput): Promise<Order>;
  getOrder(orderId: string): Promise<Order | null>;
  listOrdersForUser(userId: string): Promise<Order[]>;
  listOrdersForVendor(vendorId: string): Promise<Order[]>;
  updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order>;

  fetchVendorSettings(vendorId: string): Promise<VendorSettings | null>;
  fetchRewardActivities(userId: string): Promise<RewardActivity[]>;
  recordRewardActivity(activity: RewardActivityInput): Promise<RewardActivity>;
  adjustUserLoyaltyPoints(userId: string, delta: number): Promise<number>;

  subscribeToOrders(vendorId: string, handler: (order: Order) => void): Subscription;
  subscribeToMenu(vendorId: string, handler: (menuItem: MenuItem) => void): Subscription;
}
