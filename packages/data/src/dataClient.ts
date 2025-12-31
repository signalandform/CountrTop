import {
  AuthProvider,
  LoyaltyLedgerEntry,
  OrderSnapshot,
  PushDevice,
  PushPlatform,
  User,
  Vendor
} from './models';

export type Subscription = {
  unsubscribe: () => Promise<void> | void;
};

export type OrderSnapshotInput = Omit<OrderSnapshot, 'id' | 'placedAt'> &
  Partial<Pick<OrderSnapshot, 'id' | 'placedAt'>>;

export type LoyaltyLedgerEntryInput = Omit<LoyaltyLedgerEntry, 'id' | 'createdAt'> &
  Partial<Pick<LoyaltyLedgerEntry, 'id' | 'createdAt'>>;

export type PushDeviceInput = Omit<PushDevice, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<PushDevice, 'id' | 'createdAt' | 'updatedAt'>> & {
    platform: PushPlatform;
  };

export interface DataClient {
  signInWithProvider(provider: AuthProvider, idToken: string): Promise<User>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<User | null>;

  getVendorBySlug(slug: string): Promise<Vendor | null>;
  getVendorById(vendorId: string): Promise<Vendor | null>;
  getVendorBySquareLocationId(locationId: string): Promise<Vendor | null>;

  createOrderSnapshot(order: OrderSnapshotInput): Promise<OrderSnapshot>;
  getOrderSnapshot(orderId: string): Promise<OrderSnapshot | null>;
  getOrderSnapshotBySquareOrderId(vendorId: string, squareOrderId: string): Promise<OrderSnapshot | null>;
  listOrderSnapshotsForUser(vendorId: string, userId: string): Promise<OrderSnapshot[]>;
  listOrderSnapshotsForVendor(vendorId: string): Promise<OrderSnapshot[]>;
  updateOrderSnapshotStatus(
    orderId: string,
    vendorId: string,
    status: 'READY' | 'COMPLETE'
  ): Promise<OrderSnapshot>;

  recordLoyaltyEntry(entry: LoyaltyLedgerEntryInput): Promise<LoyaltyLedgerEntry>;
  listLoyaltyEntriesForUser(vendorId: string, userId: string): Promise<LoyaltyLedgerEntry[]>;
  getLoyaltyBalance(vendorId: string, userId: string): Promise<number>;

  upsertPushDevice(device: PushDeviceInput): Promise<PushDevice>;
  listPushDevicesForUser(userId: string): Promise<PushDevice[]>;
}
