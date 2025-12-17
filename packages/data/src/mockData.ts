import { CreateOrderInput, DataClient, MenuItemInput, Subscription } from './dataClient';
import {
  MenuItem,
  Order,
  OrderStatus,
  RewardActivity,
  RewardActivityInput,
  User,
  VendorSettings
} from './models';

export type MockDataSeed = {
  menuItems?: MenuItem[];
  orders?: Order[];
  users?: User[];
  rewardActivities?: RewardActivity[];
  vendorSettings?: VendorSettings[];
};

type Listener<T> = (payload: T) => void;

class Broadcast<T> {
  private listeners = new Set<Listener<T>>();

  emit(payload: T) {
    this.listeners.forEach(listener => listener(payload));
  }

  subscribe(listener: Listener<T>): Subscription {
    this.listeners.add(listener);
    return {
      unsubscribe: () => {
        this.listeners.delete(listener);
      }
    };
  }
}

export class MockDataClient implements DataClient {
  private menuItems: MenuItem[];
  private orders: Order[];
  private users: User[];
  private rewardActivities: RewardActivity[];
  private vendorSettings: VendorSettings[];

  private menuBroadcasts = new Map<string, Broadcast<MenuItem>>();
  private orderBroadcasts = new Map<string, Broadcast<Order>>();

  constructor(seed: MockDataSeed = {}) {
    this.menuItems = [...(seed.menuItems ?? defaultMockMenuItems)];
    this.orders = [...(seed.orders ?? defaultMockOrders)];
    this.users = [...(seed.users ?? defaultMockUsers)];
    this.rewardActivities = [...(seed.rewardActivities ?? defaultMockRewardActivities)];
    this.vendorSettings = [...(seed.vendorSettings ?? defaultMockVendorSettings)];
  }

  async signInWithEmail(email: string, _password: string): Promise<User> {
    const user = this.users.find(candidate => candidate.email === email) ?? this.users[0];
    return user;
  }

  async signOut(): Promise<void> {
    return;
  }

  async getCurrentUser(): Promise<User | null> {
    return this.users[0] ?? null;
  }

  async getMenuItems(vendorId: string): Promise<MenuItem[]> {
    return this.menuItems.filter(item => item.vendorId === vendorId);
  }

  async upsertMenuItem(menuItem: MenuItemInput): Promise<MenuItem> {
    const id = menuItem.id ?? this.createId('menu');
    const nextItem: MenuItem = { ...menuItem, id };
    const existingIndex = this.menuItems.findIndex(item => item.id === id);
    if (existingIndex >= 0) {
      this.menuItems[existingIndex] = nextItem;
    } else {
      this.menuItems.push(nextItem);
    }
    this.emitMenu(nextItem.vendorId, nextItem);
    return nextItem;
  }

  async deleteMenuItem(menuItemId: string): Promise<void> {
    const index = this.menuItems.findIndex(item => item.id === menuItemId);
    if (index >= 0) {
      const [removed] = this.menuItems.splice(index, 1);
      this.emitMenu(removed.vendorId, removed);
    }
  }

  async createOrder(order: CreateOrderInput): Promise<Order> {
    const id = order.id ?? this.createId('order');
    const createdAt = order.createdAt ?? new Date().toISOString();
    const nextOrder: Order = {
      ...order,
      id,
      createdAt,
      updatedAt: order.updatedAt ?? createdAt,
      status: order.status ?? 'pending'
    };
    this.orders.push(nextOrder);
    this.emitOrder(nextOrder.vendorId, nextOrder);
    return nextOrder;
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return this.orders.find(order => order.id === orderId) ?? null;
  }

  async listOrdersForUser(userId: string): Promise<Order[]> {
    return this.orders.filter(order => order.userId === userId);
  }

  async listOrdersForVendor(vendorId: string): Promise<Order[]> {
    return this.orders.filter(order => order.vendorId === vendorId);
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const order = this.orders.find(candidate => candidate.id === orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    const nextOrder = { ...order, status, updatedAt: new Date().toISOString() };
    const index = this.orders.findIndex(candidate => candidate.id === orderId);
    this.orders[index] = nextOrder;
    this.emitOrder(nextOrder.vendorId, nextOrder);
    return nextOrder;
  }

  async fetchVendorSettings(vendorId: string): Promise<VendorSettings | null> {
    return this.vendorSettings.find(settings => settings.vendorId === vendorId) ?? null;
  }

  async fetchRewardActivities(userId: string): Promise<RewardActivity[]> {
    return this.rewardActivities.filter(activity => activity.userId === userId);
  }

  async recordRewardActivity(activity: RewardActivityInput): Promise<RewardActivity> {
    const occurredAt = activity.occurredAt ?? new Date().toISOString();
    const nextActivity: RewardActivity = {
      ...activity,
      id: activity.id ?? this.createId('reward'),
      occurredAt
    };
    this.rewardActivities = [nextActivity, ...this.rewardActivities];
    return nextActivity;
  }

  async adjustUserLoyaltyPoints(userId: string, delta: number): Promise<number> {
    const user = this.users.find(candidate => candidate.id === userId);
    if (!user) throw new Error(`User ${userId} not found`);
    const current = user.loyaltyPoints ?? 0;
    const next = Math.max(0, current + delta);
    user.loyaltyPoints = next;
    return next;
  }

  subscribeToOrders(vendorId: string, handler: (order: Order) => void): Subscription {
    return this.getOrderBroadcast(vendorId).subscribe(handler);
  }

  subscribeToMenu(vendorId: string, handler: (menuItem: MenuItem) => void): Subscription {
    return this.getMenuBroadcast(vendorId).subscribe(handler);
  }

  private createId(prefix: string) {
    return `${prefix}_${Math.random().toString(16).slice(2)}`;
  }

  private getMenuBroadcast(vendorId: string) {
    const existing = this.menuBroadcasts.get(vendorId);
    if (existing) return existing;
    const next = new Broadcast<MenuItem>();
    this.menuBroadcasts.set(vendorId, next);
    return next;
  }

  private getOrderBroadcast(vendorId: string) {
    const existing = this.orderBroadcasts.get(vendorId);
    if (existing) return existing;
    const next = new Broadcast<Order>();
    this.orderBroadcasts.set(vendorId, next);
    return next;
  }

  private emitMenu(vendorId: string, menuItem: MenuItem) {
    this.getMenuBroadcast(vendorId).emit(menuItem);
  }

  private emitOrder(vendorId: string, order: Order) {
    this.getOrderBroadcast(vendorId).emit(order);
  }
}

export const defaultMockMenuItems: MenuItem[] = [
  {
    id: 'menu_espresso',
    vendorId: 'vendor_cafe',
    name: 'Espresso',
    description: 'Rich espresso shot with caramel notes',
    price: 325,
    currency: 'USD',
    isAvailable: true,
    category: 'Coffee',
    tags: ['hot', 'caffeine']
  },
  {
    id: 'menu_croissant',
    vendorId: 'vendor_cafe',
    name: 'Butter Croissant',
    description: 'Flaky pastry baked fresh daily',
    price: 450,
    currency: 'USD',
    isAvailable: true,
    category: 'Bakery',
    tags: ['vegetarian']
  },
  {
    id: 'menu_sandwich',
    vendorId: 'vendor_foodtruck',
    name: 'Chipotle Chicken Sandwich',
    description: 'Grilled chicken, chipotle mayo, and pickled onions',
    price: 1099,
    currency: 'USD',
    isAvailable: true,
    category: 'Entrees',
    tags: ['spicy']
  }
];

export const defaultMockOrders: Order[] = [
  {
    id: 'order_one',
    vendorId: 'vendor_cafe',
    userId: 'user_jane',
    items: [
      { menuItemId: 'menu_espresso', quantity: 2, price: 325 },
      { menuItemId: 'menu_croissant', quantity: 1, price: 450 }
    ],
    status: 'ready',
    total: 1100,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    etaMinutes: 5
  },
  {
    id: 'order_two',
    vendorId: 'vendor_foodtruck',
    userId: 'user_alex',
    items: [{ menuItemId: 'menu_sandwich', quantity: 1, price: 1099 }],
    status: 'preparing',
    total: 1099,
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString()
  }
];

export const defaultMockUsers: User[] = [
  {
    id: 'user_jane',
    email: 'jane@example.com',
    displayName: 'Jane Doe',
    role: 'customer',
    loyaltyPoints: 120
  },
  {
    id: 'user_alex',
    email: 'alex@example.com',
    displayName: 'Alex Taylor',
    role: 'vendor',
    preferredVendorId: 'vendor_foodtruck'
  }
];

export const defaultMockRewardActivities: RewardActivity[] = [
  {
    id: 'reward1',
    userId: 'user_jane',
    vendorId: 'vendor_cafe',
    points: 50,
    type: 'earn',
    description: 'Morning order bonus',
    occurredAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    orderId: 'order_one'
  },
  {
    id: 'reward2',
    userId: 'user_jane',
    vendorId: 'vendor_cafe',
    points: -20,
    type: 'redeem',
    description: 'Free extra shot redemption',
    occurredAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
  }
];

export const defaultMockVendorSettings: VendorSettings[] = [
  {
    vendorId: 'vendor_cafe',
    currency: 'USD',
    timezone: 'America/Los_Angeles',
    enableLoyalty: true,
    loyaltyEarnRate: 0.05,
    loyaltyRedeemRate: 0.01,
    defaultPrepMinutes: 7
  },
  {
    vendorId: 'vendor_foodtruck',
    currency: 'USD',
    timezone: 'America/New_York',
    enableLoyalty: false,
    allowScheduledOrders: false,
    defaultPrepMinutes: 12
  }
];

export const createMockDataClient = (seed?: MockDataSeed) => new MockDataClient(seed);
