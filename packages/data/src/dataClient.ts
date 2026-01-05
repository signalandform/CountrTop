import {
  AuthProvider,
  KitchenTicket,
  KitchenTicketWithOrder,
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

  // KDS: Square Orders Mirror + Kitchen Tickets (server-only methods)
  upsertSquareOrderFromSquare(order: Record<string, unknown>): Promise<void>;
  ensureKitchenTicketForOpenOrder(order: Record<string, unknown>): Promise<void>;
  updateTicketForTerminalOrderState(order: Record<string, unknown>): Promise<void>;

  // KDS: Queue Management
  listActiveKitchenTickets(locationId: string): Promise<KitchenTicketWithOrder[]>;
  updateKitchenTicketStatus(
    ticketId: string,
    status: 'ready' | 'completed',
    vendorUserId?: string
  ): Promise<KitchenTicket>;

  // KDS: Analytics (Milestone 9)
  getKdsSummary(
    locationId: string,
    startDate: Date,
    endDate: Date,
    timezone: string
  ): Promise<import('@countrtop/models').KdsSummary>;
  getKdsThroughput(
    locationId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week',
    timezone: string
  ): Promise<import('@countrtop/models').KdsThroughputPoint[]>;
  getKdsPrepTimeSeries(
    locationId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week',
    timezone: string
  ): Promise<import('@countrtop/models').KdsPrepTimePoint[]>;
  getKdsHeatmap(
    locationId: string,
    startDate: Date,
    endDate: Date,
    timezone: string
  ): Promise<import('@countrtop/models').KdsHeatmapCell[]>;
  getKdsBySource(
    locationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<import('@countrtop/models').KdsSourceMetrics>;
  
  // Revenue Analytics (Milestone 10A)
  getRevenueSeries(
    locationId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week' | 'month',
    timezone: string
  ): Promise<import('@countrtop/models').RevenuePoint[]>;
  getRevenueBySource(
    locationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<import('@countrtop/models').RevenueBySource>;
  getAovSeries(
    locationId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week' | 'month',
    timezone: string
  ): Promise<import('@countrtop/models').AovPoint[]>;
  
  // Customer Analytics (Milestone 10B - CountrTop Online Only)
  getCustomerSummary(
    vendorId: string,
    startDate: Date,
    endDate: Date
  ): Promise<import('@countrtop/models').CustomerSummary>;
  getCustomerLtv(
    vendorId: string
  ): Promise<import('@countrtop/models').CustomerLtvPoint[]>;
  getRepeatCustomerMetrics(
    vendorId: string,
    startDate: Date,
    endDate: Date
  ): Promise<import('@countrtop/models').RepeatCustomerMetrics>;
  
  // Item Performance (Milestone 10B)
  getItemPerformance(
    vendorId: string,
    startDate: Date,
    endDate: Date
  ): Promise<import('@countrtop/models').ItemPerformance[]>;
}
