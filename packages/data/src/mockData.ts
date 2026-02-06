import {
  DataClient,
  LoyaltyLedgerEntryInput,
  OrderSnapshotInput,
  PushDeviceInput,
  WebhookEvent,
  WebhookJob
} from './dataClient';
import { KitchenTicket, KitchenTicketWithOrder, LoyaltyLedgerEntry, OrderSnapshot, PushDevice, User, Vendor } from './models';

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

  async getVendorBySquareLocationId(locationId: string): Promise<Vendor | null> {
    return this.vendors.find((vendor) => vendor.squareLocationId === locationId) ?? null;
  }

  async getSquarePaymentsActivationStatus(vendorId: string): Promise<{
    activated: boolean | null;
    checkedAt: string | null;
    error: string | null;
    locationId: string | null;
  } | null> {
    const vendor = this.vendors.find((v) => v.id === vendorId);
    return vendor ? { activated: true, checkedAt: new Date().toISOString(), error: null, locationId: null } : null;
  }

  async setSquarePaymentsActivationStatus(
    vendorId: string,
    data: { activated: boolean; checkedAt: string; error?: string | null; locationId?: string | null }
  ): Promise<void> {
    void vendorId;
    void data;
    // No-op for mock
  }

  async updateVendorKdsNavView(vendorId: string, kdsNavView: 'full' | 'minimized'): Promise<void> {
    const v = this.vendors.find(x => x.id === vendorId);
    if (v) (v as { kdsNavView?: 'full' | 'minimized' }).kdsNavView = kdsNavView;
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  // Mock vendor location methods - return empty/null for mock client
  async listVendorLocations(vendorId: string, includeInactive = false): Promise<import('./models').VendorLocation[]> {
    return [];
  }

  async getVendorLocationBySquareId(squareLocationId: string): Promise<import('./models').VendorLocation | null> {
    return null;
  }

  async getVendorLocationById(locationId: string): Promise<import('./models').VendorLocation | null> {
    return null;
  }

  async createVendorLocation(location: Omit<import('./models').VendorLocation, 'id' | 'createdAt' | 'updatedAt'>): Promise<import('./models').VendorLocation> {
    throw new Error('createVendorLocation not implemented in mock client');
  }

  async updateVendorLocation(
    locationId: string,
    updates: Partial<Omit<import('./models').VendorLocation, 'id' | 'vendorId' | 'squareLocationId' | 'createdAt' | 'updatedAt'>>
  ): Promise<import('./models').VendorLocation> {
    throw new Error('updateVendorLocation not implemented in mock client');
  }

  async deleteVendorLocation(locationId: string): Promise<void> {
    throw new Error('deleteVendorLocation not implemented in mock client');
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

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

  async getOrderSnapshotBySquareOrderId(
    vendorId: string,
    squareOrderId: string
  ): Promise<OrderSnapshot | null> {
    return (
      this.orderSnapshots.find(
        (order) => order.vendorId === vendorId && order.squareOrderId === squareOrderId
      ) ?? null
    );
  }

  async listOrderSnapshotsForUser(vendorId: string, userId: string): Promise<OrderSnapshot[]> {
    return this.orderSnapshots.filter((order) => order.vendorId === vendorId && order.userId === userId);
  }

  async listOrderSnapshotsForVendor(vendorId: string): Promise<OrderSnapshot[]> {
    return this.orderSnapshots.filter((order) => order.vendorId === vendorId);
  }

  async updateOrderSnapshotStatus(
    orderId: string,
    vendorId: string,
    status: 'READY' | 'COMPLETE'
  ): Promise<OrderSnapshot> {
    const order = this.orderSnapshots.find((o) => o.id === orderId && o.vendorId === vendorId);
    if (!order) {
      throw new Error('Order not found or does not belong to vendor');
    }

    const now = new Date().toISOString();
    order.fulfillmentStatus = status;
    if (status === 'READY') {
      order.readyAt = now;
    } else if (status === 'COMPLETE') {
      order.completedAt = now;
    }
    order.updatedAt = now;

    return order;
  }

  async updateOrderSnapshotFeedback(
    orderSnapshotId: string,
    rating: 'thumbs_up' | 'thumbs_down'
  ): Promise<void> {
    const order = this.orderSnapshots.find((o) => o.id === orderSnapshotId);
    if (order) {
      order.customerFeedbackRating = rating;
    }
  }

  async insertWebhookEventIfNew(params: {
    provider: string;
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<{ created: boolean; webhookEvent: WebhookEvent }> {
    const now = new Date().toISOString();
    return {
      created: true,
      webhookEvent: {
        id: `we_${params.eventId}`,
        provider: params.provider,
        eventId: params.eventId,
        eventType: params.eventType,
        payload: params.payload,
        receivedAt: now,
        processedAt: null,
        status: 'received',
        error: null
      }
    };
  }

  async enqueueWebhookJob(params: {
    provider: string;
    eventId: string;
    webhookEventId: string;
  }): Promise<WebhookJob> {
    const now = new Date().toISOString();
    return {
      id: `wj_${params.eventId}`,
      provider: params.provider,
      eventId: params.eventId,
      webhookEventId: params.webhookEventId,
      status: 'queued',
      attempts: 0,
      runAfter: now,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      createdAt: now,
      updatedAt: now
    };
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  async claimWebhookJobsRPC(params: {
    provider: string;
    limit: number;
    lockedBy: string;
  }): Promise<WebhookJob[]> {
    void params;
    return [];
  }

  async resetStaleWebhookJobs(): Promise<number> {
    return 0;
  }

  async markWebhookJobDone(jobId: string): Promise<void> {
    void jobId;
  }

  async markWebhookJobFailed(jobId: string, error: string, backoffSeconds: number): Promise<void> {
    void jobId;
    void error;
    void backoffSeconds;
  }

  async updateWebhookEventStatus(
    webhookEventId: string,
    params: { status: string; processedAt?: string; error?: string }
  ): Promise<void> {
    void webhookEventId;
    void params;
  }

  async getWebhookEventById(id: string): Promise<WebhookEvent | null> {
    void id;
    return null;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns empty list
  async listVendorOrderMilestones(_vendorId: string): Promise<import('./dataClient').VendorOrderMilestone[]> {
    return [];
  }

  /* eslint-disable @typescript-eslint/no-unused-vars -- mock no-op */
  async markVendorOrderMilestoneSeen(
    _vendorId: string,
    _milestone: number,
    _milestoneType: string
  ): Promise<void> {
    return;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock no-op
  async claimVendorOrderMilestone(_vendorId: string, _milestone: number): Promise<void> {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns empty list
  async listSupportTickets(_filters: { vendorId?: string; status?: string }): Promise<import('@countrtop/models').SupportTicket[]> {
    return [];
  }

  async createSupportTicket(input: {
    vendorId: string;
    subject: string;
    message: string;
    submittedBy?: string | null;
  }): Promise<import('@countrtop/models').SupportTicket> {
    const now = new Date().toISOString();
    const id = `st_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return {
      id,
      vendorId: input.vendorId,
      subject: input.subject,
      message: input.message,
      status: 'open',
      submittedBy: input.submittedBy ?? undefined,
      createdAt: now,
      updatedAt: now
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns null
  async getSupportTicket(_id: string): Promise<import('@countrtop/models').SupportTicket | null> {
    return null;
  }

  /* eslint-disable @typescript-eslint/no-unused-vars -- mock throws, params unused */
  async updateSupportTicket(
    _id: string,
    _updates: { status?: import('@countrtop/models').SupportTicketStatus; opsReply?: string }
  ): Promise<import('@countrtop/models').SupportTicket> {
    throw new Error('updateSupportTicket not implemented in mock client');
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock no-op
  async recordVendorEmailUnsubscribe(_vendorId: string, _email: string): Promise<void> {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns empty list
  async listVendorEmailUnsubscribes(_vendorId: string): Promise<string[]> {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns 0
  async getVendorCrmUsage(_vendorId: string, _periodStart: string): Promise<number> {
    return 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock no-op
  async incrementVendorCrmUsage(_vendorId: string, _periodStart: string, _count: number): Promise<void> {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns null
  async getVendorSquareIntegration(
    _vendorId: string,
    _environment: 'sandbox' | 'production'
  ): Promise<import('@countrtop/models').VendorSquareIntegration | null> {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns stub
  async setVendorSquareIntegration(
    vendorId: string,
    environment: 'sandbox' | 'production',
    data: Partial<Omit<import('@countrtop/models').VendorSquareIntegration, 'vendorId' | 'squareEnvironment' | 'connectedAt'>>
  ): Promise<import('@countrtop/models').VendorSquareIntegration> {
    const now = new Date().toISOString();
    return {
      vendorId,
      squareEnvironment: environment,
      squareAccessToken: data.squareAccessToken ?? 'mock_token',
      squareRefreshToken: data.squareRefreshToken ?? 'mock_refresh',
      squareMerchantId: data.squareMerchantId ?? null,
      availableLocationIds: data.availableLocationIds ?? [],
      selectedLocationId: data.selectedLocationId ?? null,
      connectionStatus: (data.connectionStatus ?? 'connected') as 'connected',
      connectedAt: now,
      updatedAt: data.updatedAt ?? now,
      lastError: data.lastError ?? null
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock no-op
  async setSelectedSquareLocation(_vendorId: string, _locationId: string): Promise<void> {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns false
  async refreshSquareTokenIfNeeded(
    _vendorId: string,
    _environment: 'sandbox' | 'production'
  ): Promise<boolean> {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns empty
  async listSquareLocations(_vendorId: string): Promise<Array<{ id: string; name?: string }>> {
    return [];
  }

  async upsertVendorBilling(
    vendorId: string,
    data: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string | null;
      planId?: import('@countrtop/models').BillingPlanId;
      status?: string;
      currentPeriodEnd?: string | null;
    }
  ): Promise<import('@countrtop/models').VendorBilling> {
    const now = new Date().toISOString();
    return {
      vendorId,
      planId: data.planId ?? 'beta',
      status: data.status ?? 'active',
      stripeCustomerId: data.stripeCustomerId ?? null,
      stripeSubscriptionId: data.stripeSubscriptionId ?? null,
      currentPeriodEnd: data.currentPeriodEnd ?? null,
      createdAt: now,
      updatedAt: now
    };
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns defaults
  async getVendorLoyaltySettings(_vendorId: string): Promise<import('@countrtop/models').VendorLoyaltySettings> {
    return { minPointsToRedeem: 100, maxPointsPerOrder: 500, centsPerPoint: 1 };
  }

  /* eslint-disable @typescript-eslint/no-unused-vars -- mock no-op */
  async setVendorLoyaltySettings(
    _vendorId: string,
    _settings: import('@countrtop/models').VendorLoyaltySettings
  ): Promise<void> {
    return;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns null
  async getVendorBilling(_vendorId: string): Promise<import('@countrtop/models').VendorBilling | null> {
    return null;
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

  // KDS: Square Orders Mirror + Kitchen Tickets (server-only methods)
  // Mock implementations are no-ops since these are server-side only
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async upsertSquareOrderFromSquare(_order: Record<string, unknown>): Promise<void> {
    // No-op for mock client
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async ensureKitchenTicketForOpenOrder(_order: Record<string, unknown>): Promise<void> {
    // No-op for mock client
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateTicketForTerminalOrderState(_order: Record<string, unknown>): Promise<void> {
    // No-op for mock client
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async listActiveKitchenTickets(_locationId: string): Promise<KitchenTicketWithOrder[]> {
    // Return empty array for mock client
    return [];
  }

  async updateKitchenTicketStatus(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _ticketId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _status: KitchenTicket['status'],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _userId: string
  ): Promise<KitchenTicket> {
    throw new Error('updateKitchenTicketStatus not implemented in mock client');
  }

  async getKdsSummary(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _locationId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timezone: string
  ): Promise<import('@countrtop/models').KdsSummary> {
    return {
      period: {
        start: _startDate.toISOString(),
        end: _endDate.toISOString()
      },
      totals: {
        ticketsPlaced: 0,
        ticketsReady: 0,
        ticketsCompleted: 0,
        ticketsCanceled: 0
      },
      averages: {
        prepTimeMinutes: null,
        totalTimeMinutes: null,
        queueDepth: 0
      },
      throughput: {
        ticketsPerDay: 0,
        ticketsPerHour: 0
      }
    };
  }

  async getKdsThroughput(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _locationId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _granularity: 'hour' | 'day' | 'week',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timezone: string
  ): Promise<import('@countrtop/models').KdsThroughputPoint[]> {
    return [];
  }

  async getKdsPrepTimeSeries(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _locationId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _granularity: 'hour' | 'day' | 'week',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timezone: string
  ): Promise<import('@countrtop/models').KdsPrepTimePoint[]> {
    return [];
  }

  async getKdsHeatmap(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _locationId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timezone: string
  ): Promise<import('@countrtop/models').KdsHeatmapCell[]> {
    return [];
  }

  async getKdsBySource(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _locationId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date
  ): Promise<import('@countrtop/models').KdsSourceMetrics> {
    return {
      countrtop_online: {
        count: 0,
        avgPrepTimeMinutes: null,
        avgTotalTimeMinutes: null
      },
      square_pos: {
        count: 0,
        avgPrepTimeMinutes: null,
        avgTotalTimeMinutes: null
      }
    };
  }

  async getRevenueSeries(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _locationId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _granularity: 'hour' | 'day' | 'week' | 'month',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timezone: string
  ): Promise<import('@countrtop/models').RevenuePoint[]> {
    return [];
  }

  async getRevenueBySource(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _locationId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date
  ): Promise<import('@countrtop/models').RevenueBySource> {
    return {
      countrtop_online: {
        revenue: 0,
        orderCount: 0,
        averageOrderValue: 0
      },
      square_pos: {
        revenue: 0,
        orderCount: 0,
        averageOrderValue: 0
      },
      total: {
        revenue: 0,
        orderCount: 0,
        averageOrderValue: 0
      }
    };
  }

  async getAovSeries(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _locationId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _granularity: 'hour' | 'day' | 'week' | 'month',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timezone: string
  ): Promise<import('@countrtop/models').AovPoint[]> {
    return [];
  }

  // Customer Analytics (Milestone 10B - CountrTop Online Only)
  async getCustomerSummary(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date
  ): Promise<import('@countrtop/models').CustomerSummary> {
    return {
      totalCustomers: 0,
      repeatCustomers: 0,
      repeatCustomerRate: 0,
      averageOrdersPerCustomer: 0,
      averageLifetimeValue: 0,
      newCustomers: 0,
      returningCustomers: 0
    };
  }

  async getCustomerLtv(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string
  ): Promise<import('@countrtop/models').CustomerLtvPoint[]> {
    return [];
  }

  async getRepeatCustomerMetrics(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date
  ): Promise<import('@countrtop/models').RepeatCustomerMetrics> {
    return {
      repeatCustomerRate: 0,
      totalCustomers: 0,
      repeatCustomers: 0,
      singleOrderCustomers: 0
    };
  }

  // Item Performance (Milestone 10B)
  async getItemPerformance(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date
  ): Promise<import('@countrtop/models').ItemPerformance[]> {
    return [];
  }

  // Feature Flags (Milestone H)
  async getVendorFeatureFlag(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _featureKey: string
  ): Promise<boolean> {
    return false;
  }

  async setVendorFeatureFlag(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _featureKey: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _enabled: boolean
  ): Promise<void> {
    return;
  }

  async getVendorFeatureFlags(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string
  ): Promise<Record<string, boolean>> {
    return {};
  }

  async getLocationPins(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string
  ): Promise<Record<string, boolean>> {
    return {};
  }

  async setLocationPin(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _locationId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _pin: string
  ): Promise<void> {
    return;
  }

  // Employees & Time Tracking
  async listEmployees(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string
  ): Promise<import('@countrtop/models').Employee[]> {
    return [];
  }

  async createEmployee(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _name: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _pin: string
  ): Promise<import('@countrtop/models').Employee> {
    throw new Error('Not implemented in mock data');
  }

  async updateEmployee(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _employeeId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _updates: { name?: string; pin?: string; isActive?: boolean }
  ): Promise<import('@countrtop/models').Employee> {
    throw new Error('Not implemented in mock data');
  }

  async deleteEmployee(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _employeeId: string
  ): Promise<void> {
    return;
  }

  async getEmployeeByPin(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _pin: string
  ): Promise<import('@countrtop/models').Employee | null> {
    return null;
  }

  async clockIn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _employeeId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _locationId: string | null
  ): Promise<import('@countrtop/models').TimeEntry> {
    throw new Error('Not implemented in mock data');
  }

  async clockOut(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _employeeId: string
  ): Promise<import('@countrtop/models').TimeEntry> {
    throw new Error('Not implemented in mock data');
  }

  async getActiveTimeEntry(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _employeeId: string
  ): Promise<import('@countrtop/models').TimeEntry | null> {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock returns empty
  async listActiveTimeEntries(_vendorId: string): Promise<import('@countrtop/models').TimeEntry[]> {
    return [];
  }

  async listTimeEntries(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _vendorId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _employeeId: string | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endDate: Date
  ): Promise<import('@countrtop/models').TimeEntry[]> {
    return [];
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
    squareLocationId: 'SQUARE_LOCATION_REQUIRED',
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
    externalOrderId: 'square_order_demo',
    squareOrderId: 'square_order_demo', // Deprecated alias
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
