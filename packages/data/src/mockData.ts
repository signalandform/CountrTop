import { DataClient, LoyaltyLedgerEntryInput, OrderSnapshotInput, PushDeviceInput } from './dataClient';
import { LoyaltyLedgerEntry, OrderSnapshot, PushDevice, User, Vendor } from './models';

export type MockDataSeed = {
  vendors?: Vendor[];
  orderSnapshots?: OrderSnapshot[];
  users?: User[];
  loyaltyLedger?: LoyaltyLedgerEntry[];
  pushDevices?: PushDevice[];
};

export class MockDataClient implements DataClient {
  private vendors: Vendor[];
  private orderSnapshots: OrderSnapshot[];
  private users: User[];
  private loyaltyLedger: LoyaltyLedgerEntry[];
  private pushDevices: PushDevice[];

  constructor(seed: MockDataSeed = {}) {
    this.vendors = [...(seed.vendors ?? defaultMockVendors)];
    this.orderSnapshots = [...(seed.orderSnapshots ?? defaultMockOrderSnapshots)];
    this.users = [...(seed.users ?? defaultMockUsers)];
    this.loyaltyLedger = [...(seed.loyaltyLedger ?? defaultMockLoyaltyLedger)];
    this.pushDevices = [...(seed.pushDevices ?? defaultMockPushDevices)];
  }

  async signInWithProvider(provider: User['provider'], idToken: string): Promise<User> {
    const existing = this.users.find((candidate) => candidate.provider === provider);
    if (existing) {
      return existing;
    }
    const nextUser: User = {
      id: this.createId('user'),
      provider,
      providerUserId: idToken,
      displayName: `${provider} user`
    };
    this.users.push(nextUser);
    return nextUser;
  }

  async signOut(): Promise<void> {
    return;
  }

  async getCurrentUser(): Promise<User | null> {
    return this.users[0] ?? null;
  }

  async getVendorBySlug(slug: string): Promise<Vendor | null> {
    return this.vendors.find((vendor) => vendor.slug === slug) ?? null;
  }

  async getVendorById(vendorId: string): Promise<Vendor | null> {
    return this.vendors.find((vendor) => vendor.id === vendorId) ?? null;
  }

  async createOrderSnapshot(order: OrderSnapshotInput): Promise<OrderSnapshot> {
    const id = order.id ?? this.createId('order');
    const placedAt = order.placedAt ?? new Date().toISOString();
    const nextOrder: OrderSnapshot = { ...order, id, placedAt };
    this.orderSnapshots.push(nextOrder);
    return nextOrder;
  }

  async getOrderSnapshot(orderId: string): Promise<OrderSnapshot | null> {
    return this.orderSnapshots.find((order) => order.id === orderId) ?? null;
  }

  async listOrderSnapshotsForUser(vendorId: string, userId: string): Promise<OrderSnapshot[]> {
    return this.orderSnapshots.filter((order) => order.vendorId === vendorId && order.userId === userId);
  }

  async listOrderSnapshotsForVendor(vendorId: string): Promise<OrderSnapshot[]> {
    return this.orderSnapshots.filter((order) => order.vendorId === vendorId);
  }

  async recordLoyaltyEntry(entry: LoyaltyLedgerEntryInput): Promise<LoyaltyLedgerEntry> {
    const id = entry.id ?? this.createId('ledger');
    const createdAt = entry.createdAt ?? new Date().toISOString();
    const nextEntry: LoyaltyLedgerEntry = { ...entry, id, createdAt };
    this.loyaltyLedger = [nextEntry, ...this.loyaltyLedger];
    return nextEntry;
  }

  async listLoyaltyEntriesForUser(vendorId: string, userId: string): Promise<LoyaltyLedgerEntry[]> {
    return this.loyaltyLedger.filter((entry) => entry.vendorId === vendorId && entry.userId === userId);
  }

  async getLoyaltyBalance(vendorId: string, userId: string): Promise<number> {
    return this.loyaltyLedger
      .filter((entry) => entry.vendorId === vendorId && entry.userId === userId)
      .reduce((sum, entry) => sum + entry.pointsDelta, 0);
  }

  async upsertPushDevice(device: PushDeviceInput): Promise<PushDevice> {
    const now = new Date().toISOString();
    const existingIndex = this.pushDevices.findIndex(
      (candidate) =>
        (device.id && candidate.id === device.id) ||
        (candidate.userId === device.userId && candidate.deviceToken === device.deviceToken)
    );

    const nextDevice: PushDevice = {
      id: device.id ?? this.createId('push'),
      createdAt: device.createdAt ?? now,
      updatedAt: now,
      ...device
    };

    if (existingIndex >= 0) {
      this.pushDevices[existingIndex] = { ...this.pushDevices[existingIndex], ...nextDevice };
    } else {
      this.pushDevices.push(nextDevice);
    }

    return nextDevice;
  }

  async listPushDevicesForUser(userId: string): Promise<PushDevice[]> {
    return this.pushDevices.filter((device) => device.userId === userId);
  }

  private createId(prefix: string) {
    return `${prefix}_${Math.random().toString(16).slice(2)}`;
  }
}

export const defaultMockVendors: Vendor[] = [
  {
    id: 'vendor_cafe',
    slug: 'sunset',
    displayName: 'Sunset Coffee Cart',
    squareLocationId: 'SQUARE_LOCATION_DEMO',
    squareCredentialRef: 'square_demo',
    status: 'active'
  }
];

export const defaultMockUsers: User[] = [
  {
    id: 'user_demo',
    provider: 'apple',
    providerUserId: 'apple_demo',
    displayName: 'Demo Customer'
  }
];

export const defaultMockOrderSnapshots: OrderSnapshot[] = [
  {
    id: 'order_snapshot_demo',
    vendorId: 'vendor_cafe',
    userId: 'user_demo',
    squareOrderId: 'square_order_demo',
    placedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    snapshotJson: {
      items: [{ name: 'Espresso', quantity: 2, price: 325 }],
      total: 650,
      currency: 'USD'
    }
  }
];

export const defaultMockLoyaltyLedger: LoyaltyLedgerEntry[] = [
  {
    id: 'ledger_demo',
    vendorId: 'vendor_cafe',
    userId: 'user_demo',
    orderId: 'order_snapshot_demo',
    pointsDelta: 25,
    createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString()
  }
];

export const defaultMockPushDevices: PushDevice[] = [
  {
    id: 'push_demo',
    userId: 'user_demo',
    deviceToken: 'expo_demo_token',
    platform: 'ios',
    createdAt: new Date().toISOString()
  }
];

export const createMockDataClient = (seed?: MockDataSeed) => new MockDataClient(seed);
