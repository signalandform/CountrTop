import {
  AuthProvider,
  KitchenTicket,
  KitchenTicketWithOrder,
  LoyaltyLedgerEntry,
  OrderSnapshot,
  PushDevice,
  PushPlatform,
  User,
  Vendor,
  VendorLocation
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

export type WebhookEvent = {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  processedAt: string | null;
  status: string;
  error: string | null;
};

export type WebhookJob = {
  id: string;
  provider: string;
  eventId: string;
  webhookEventId: string;
  status: string;
  attempts: number;
  runAfter: string;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VendorOrderMilestone = {
  id: string;
  vendorId: string;
  milestone: number;
  milestoneType: 'congrats' | 'incentive_shirt' | 'incentive_plaque';
  seenAt: string;
  claimedAt: string | null;
};

export interface DataClient {
  signInWithProvider(provider: AuthProvider, idToken: string): Promise<User>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<User | null>;

  getVendorBySlug(slug: string): Promise<Vendor | null>;
  getVendorById(vendorId: string): Promise<Vendor | null>;
  getVendorBySquareLocationId(locationId: string): Promise<Vendor | null>;

  getSquarePaymentsActivationStatus(vendorId: string): Promise<{
    activated: boolean | null;
    checkedAt: string | null;
    error: string | null;
    locationId: string | null;
  } | null>;
  setSquarePaymentsActivationStatus(
    vendorId: string,
    data: { activated: boolean; checkedAt: string; error?: string | null; locationId?: string | null }
  ): Promise<void>;
  updateVendorKdsNavView(vendorId: string, kdsNavView: 'full' | 'minimized'): Promise<void>;

  // Multi-Location Support
  listVendorLocations(vendorId: string, includeInactive?: boolean): Promise<VendorLocation[]>;
  getVendorLocationBySquareId(squareLocationId: string): Promise<VendorLocation | null>;
  getVendorLocationById(locationId: string): Promise<VendorLocation | null>;
  createVendorLocation(location: Omit<VendorLocation, 'id' | 'createdAt' | 'updatedAt'>): Promise<VendorLocation>;
  updateVendorLocation(
    locationId: string,
    updates: Partial<Omit<VendorLocation, 'id' | 'vendorId' | 'squareLocationId' | 'createdAt' | 'updatedAt'>>
  ): Promise<VendorLocation>;
  deleteVendorLocation(locationId: string): Promise<void>;

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
  updateOrderSnapshotFeedback(
    orderSnapshotId: string,
    rating: 'thumbs_up' | 'thumbs_down'
  ): Promise<void>;

  recordLoyaltyEntry(entry: LoyaltyLedgerEntryInput): Promise<LoyaltyLedgerEntry>;
  listLoyaltyEntriesForUser(vendorId: string, userId: string): Promise<LoyaltyLedgerEntry[]>;
  getLoyaltyBalance(vendorId: string, userId: string): Promise<number>;
  getVendorLoyaltySettings(vendorId: string): Promise<import('@countrtop/models').VendorLoyaltySettings>;
  setVendorLoyaltySettings(
    vendorId: string,
    settings: import('@countrtop/models').VendorLoyaltySettings
  ): Promise<void>;
  getVendorBilling(vendorId: string): Promise<import('@countrtop/models').VendorBilling | null>;
  upsertVendorBilling(
    vendorId: string,
    data: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string | null;
      planId?: import('@countrtop/models').BillingPlanId;
      status?: string;
      currentPeriodEnd?: string | null;
    }
  ): Promise<import('@countrtop/models').VendorBilling>;

  recordVendorEmailUnsubscribe(vendorId: string, email: string): Promise<void>;
  listVendorEmailUnsubscribes(vendorId: string): Promise<string[]>;

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

  // Feature Flags (Milestone H)
  getVendorFeatureFlag(vendorId: string, featureKey: string): Promise<boolean>;
  setVendorFeatureFlag(vendorId: string, featureKey: string, enabled: boolean): Promise<void>;
  getVendorFeatureFlags(vendorId: string): Promise<Record<string, boolean>>;

  // Location PINs (KDS Authentication)
  getLocationPins(vendorId: string): Promise<Record<string, boolean>>; // locationId -> hasPin
  setLocationPin(vendorId: string, locationId: string, pin: string): Promise<void>; // pin is plain text, will be hashed

  // Employees & Time Tracking
  listEmployees(vendorId: string): Promise<import('@countrtop/models').Employee[]>;
  createEmployee(vendorId: string, name: string, pin: string): Promise<import('@countrtop/models').Employee>;
  updateEmployee(employeeId: string, updates: { name?: string; pin?: string; isActive?: boolean }): Promise<import('@countrtop/models').Employee>;
  deleteEmployee(employeeId: string): Promise<void>;
  getEmployeeByPin(vendorId: string, pin: string): Promise<import('@countrtop/models').Employee | null>;
  
  clockIn(vendorId: string, employeeId: string, locationId: string | null): Promise<import('@countrtop/models').TimeEntry>;
  clockOut(vendorId: string, employeeId: string): Promise<import('@countrtop/models').TimeEntry>;
  getActiveTimeEntry(vendorId: string, employeeId: string): Promise<import('@countrtop/models').TimeEntry | null>;
  listActiveTimeEntries(vendorId: string): Promise<import('@countrtop/models').TimeEntry[]>;
  listTimeEntries(vendorId: string, employeeId: string | null, startDate: Date, endDate: Date): Promise<import('@countrtop/models').TimeEntry[]>;

  // Webhook queue (idempotent, replayable)
  insertWebhookEventIfNew(params: {
    provider: string;
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<{ created: boolean; webhookEvent: WebhookEvent }>;
  enqueueWebhookJob(params: {
    provider: string;
    eventId: string;
    webhookEventId: string;
  }): Promise<WebhookJob>;
  claimWebhookJobsRPC(params: { provider: string; limit: number; lockedBy: string }): Promise<WebhookJob[]>;
  resetStaleWebhookJobs(): Promise<number>;
  markWebhookJobDone(jobId: string): Promise<void>;
  markWebhookJobFailed(jobId: string, error: string, backoffSeconds: number): Promise<void>;
  updateWebhookEventStatus(
    webhookEventId: string,
    params: { status: string; processedAt?: string; error?: string }
  ): Promise<void>;
  getWebhookEventById(id: string): Promise<WebhookEvent | null>;

  // Vendor order milestones (CountrTop online orders)
  listVendorOrderMilestones(vendorId: string): Promise<VendorOrderMilestone[]>;
  markVendorOrderMilestoneSeen(vendorId: string, milestone: number, milestoneType: string): Promise<void>;
  claimVendorOrderMilestone(vendorId: string, milestone: number): Promise<void>;

  // Ops: support tickets
  listSupportTickets(filters: { vendorId?: string; status?: string }): Promise<import('@countrtop/models').SupportTicket[]>;
  createSupportTicket(input: {
    vendorId: string;
    subject: string;
    message: string;
    submittedBy?: string | null;
  }): Promise<import('@countrtop/models').SupportTicket>;
  getSupportTicket(id: string): Promise<import('@countrtop/models').SupportTicket | null>;
  updateSupportTicket(
    id: string,
    updates: { status?: import('@countrtop/models').SupportTicketStatus; opsReply?: string }
  ): Promise<import('@countrtop/models').SupportTicket>;
}
