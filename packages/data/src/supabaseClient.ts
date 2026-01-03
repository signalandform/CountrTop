import { randomUUID } from 'crypto';
import { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';

import { DataClient, LoyaltyLedgerEntryInput, OrderSnapshotInput, PushDeviceInput } from './dataClient';
import { LoyaltyLedgerEntry, OrderSnapshot, PushDevice, User, Vendor, VendorStatus } from './models';

// Query result cache with TTL
type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

class QueryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtl = 5 * 60 * 1000; // 5 minutes

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs = this.defaultTtl): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs
    });
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

const queryCache = new QueryCache();

// Performance logging helper
// Use lazy loading to avoid pulling in Square SDK in Edge Runtime (middleware)
let loggerModule: { getLogger?: () => { info: (msg: string, data?: unknown) => void; warn: (msg: string, data?: unknown) => void; error: (msg: string, error?: unknown, data?: unknown) => void } } | null | false = null;
const getLoggerLazy = () => {
  if (loggerModule === null) {
    try {
      // Only try to load logger if we're not in Edge Runtime
      // Import from logger-only to avoid Square SDK
      // @ts-expect-error - EdgeRuntime is a global in Edge Runtime
      if (typeof EdgeRuntime === 'undefined') {
        // Use a string literal that webpack won't statically analyze
        // Import logger directly to avoid pulling in Square SDK
        // Use a dynamic path to prevent webpack from analyzing the import
        const loggerPath = '@countrtop/api-client/logger-only';
        loggerModule = require(loggerPath);
      }
    } catch {
      loggerModule = false; // Mark as unavailable
    }
  }
  return loggerModule === false ? null : loggerModule?.getLogger?.();
};

const logQueryPerformance = (operation: string, startTime: number, success: boolean, error?: unknown) => {
  const duration = Date.now() - startTime;
  
  // Use structured logging if available, fallback to console
  const logger = getLoggerLazy();
  if (logger) {
    if (success) {
      logger.info('Query performance', { operation, durationMs: duration });
      // Log slow queries as warnings
      if (duration > 1000) {
        logger.warn('Slow query detected', { operation, durationMs: duration });
      }
    } else {
      logger.error('Query failed', error, { operation, durationMs: duration });
    }
  } else {
    // Fallback to console if logger not available
    const message = `[Query Performance] ${operation} - ${duration}ms`;
    if (success) {
      console.log(message);
    } else {
      console.error(message, error);
    }
  }
};

export type Database = {
  public: {
    Tables: {
      vendors: {
        Row: {
          id: string;
          slug: string;
          display_name: string;
          square_location_id: string;
          square_credential_ref: string | null;
          status: VendorStatus | null;
          admin_user_id: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          phone: string | null;
          timezone: string | null;
          pickup_instructions: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          display_name: string;
          square_location_id: string;
          square_credential_ref?: string | null;
          status?: VendorStatus | null;
          admin_user_id?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          phone?: string | null;
          timezone?: string | null;
          pickup_instructions?: string | null;
        };
        Update: Partial<Database['public']['Tables']['vendors']['Insert']>;
        Relationships: [];
      };
      order_snapshots: {
        Row: {
          id: string;
          vendor_id: string;
          user_id: string | null;
          square_order_id: string;
          placed_at: string;
          snapshot_json: Record<string, unknown>;
          fulfillment_status: string | null;
          ready_at: string | null;
          completed_at: string | null;
          updated_at: string | null;
          customer_display_name: string | null;
          pickup_label: string | null;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          user_id?: string | null;
          square_order_id: string;
          placed_at?: string;
          snapshot_json: Record<string, unknown>;
          fulfillment_status?: string | null;
          ready_at?: string | null;
          completed_at?: string | null;
          updated_at?: string | null;
          customer_display_name?: string | null;
          pickup_label?: string | null;
        };
        Update: Partial<Database['public']['Tables']['order_snapshots']['Insert']>;
        Relationships: [];
      };
      loyalty_ledger: {
        Row: {
          id: string;
          vendor_id: string;
          user_id: string;
          order_id: string;
          points_delta: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          user_id: string;
          order_id: string;
          points_delta: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['loyalty_ledger']['Insert']>;
        Relationships: [];
      };
      push_devices: {
        Row: {
          id: string;
          user_id: string;
          device_token: string;
          platform: string;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_token: string;
          platform: string;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['push_devices']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export class SupabaseDataClient implements DataClient {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async signInWithProvider(provider: User['provider'], idToken: string): Promise<User> {
    const { data, error } = await this.client.auth.signInWithIdToken({
      provider,
      token: idToken
    });
    if (error) throw error;
    const authUser = data.user;
    if (!authUser) throw new Error('User could not be loaded after sign-in');
    return mapAuthUser(authUser);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async getCurrentUser(): Promise<User | null> {
    const { data, error } = await this.client.auth.getUser();
    if (error) throw error;
    return mapAuthUserNullable(data.user ?? null);
  }

  async getVendorBySlug(slug: string): Promise<Vendor | null> {
    const cacheKey = `vendor:slug:${slug}`;
    const cached = queryCache.get<Vendor | null>(cacheKey);
    if (cached !== null) return cached;

    const startTime = Date.now();
    try {
      // Field limiting: only select needed columns
      const { data, error } = await this.client
        .from('vendors')
        .select('id,slug,display_name,square_location_id,square_credential_ref,status,address_line1,address_line2,city,state,postal_code,phone,timezone,pickup_instructions')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      const result = data ? mapVendorFromRow(data as Database['public']['Tables']['vendors']['Row']) : null;
      queryCache.set(cacheKey, result);
      logQueryPerformance('getVendorBySlug', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getVendorBySlug', startTime, false, error);
      throw error;
    }
  }

  async getVendorById(vendorId: string): Promise<Vendor | null> {
    const cacheKey = `vendor:id:${vendorId}`;
    const cached = queryCache.get<Vendor | null>(cacheKey);
    if (cached !== null) return cached;

    const startTime = Date.now();
    try {
      // Field limiting: only select needed columns
      const { data, error } = await this.client
        .from('vendors')
        .select('id,slug,display_name,square_location_id,square_credential_ref,status,address_line1,address_line2,city,state,postal_code,phone,timezone,pickup_instructions')
        .eq('id', vendorId)
        .maybeSingle();
      if (error) throw error;
      const result = data ? mapVendorFromRow(data as Database['public']['Tables']['vendors']['Row']) : null;
      queryCache.set(cacheKey, result);
      logQueryPerformance('getVendorById', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getVendorById', startTime, false, error);
      throw error;
    }
  }

  async getVendorBySquareLocationId(locationId: string): Promise<Vendor | null> {
    const cacheKey = `vendor:square_location:${locationId}`;
    const cached = queryCache.get<Vendor | null>(cacheKey);
    if (cached !== null) return cached;

    const startTime = Date.now();
    try {
      // Field limiting: only select needed columns
      const { data, error } = await this.client
        .from('vendors')
        .select('id,slug,display_name,square_location_id,square_credential_ref,status,address_line1,address_line2,city,state,postal_code,phone,timezone,pickup_instructions')
        .eq('square_location_id', locationId)
        .maybeSingle();
      if (error) throw error;
      const result = data ? mapVendorFromRow(data as Database['public']['Tables']['vendors']['Row']) : null;
      queryCache.set(cacheKey, result);
      logQueryPerformance('getVendorBySquareLocationId', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getVendorBySquareLocationId', startTime, false, error);
      throw error;
    }
  }

  async createOrderSnapshot(order: OrderSnapshotInput): Promise<OrderSnapshot> {
    const startTime = Date.now();
    try {
      const withId = {
        ...order,
        id: order.id ?? randomUUID()
      };
      const { data, error } = await this.client
        .from('order_snapshots')
        .insert(toOrderSnapshotInsert(withId))
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label')
        .single();
      if (error) throw error;
      const result = mapOrderSnapshotFromRow(data as Database['public']['Tables']['order_snapshots']['Row']);
      // Invalidate related cache entries
      queryCache.delete(`orders:vendor:${result.vendorId}`);
      if (result.userId) {
        queryCache.delete(`orders:user:${result.vendorId}:${result.userId}`);
      }
      logQueryPerformance('createOrderSnapshot', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('createOrderSnapshot', startTime, false, error);
      throw error;
    }
  }

  async getOrderSnapshot(orderId: string): Promise<OrderSnapshot | null> {
    const cacheKey = `order:${orderId}`;
    const cached = queryCache.get<OrderSnapshot | null>(cacheKey);
    if (cached !== null) return cached;

    const startTime = Date.now();
    try {
      // Field limiting: select only needed columns
      const { data, error } = await this.client
        .from('order_snapshots')
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label')
        .eq('id', orderId)
        .maybeSingle();
      if (error) throw error;
      const result = data
        ? mapOrderSnapshotFromRow(data as Database['public']['Tables']['order_snapshots']['Row'])
        : null;
      queryCache.set(cacheKey, result);
      logQueryPerformance('getOrderSnapshot', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getOrderSnapshot', startTime, false, error);
      throw error;
    }
  }

  async getOrderSnapshotBySquareOrderId(
    vendorId: string,
    squareOrderId: string
  ): Promise<OrderSnapshot | null> {
    const cacheKey = `order:square:${vendorId}:${squareOrderId}`;
    const cached = queryCache.get<OrderSnapshot | null>(cacheKey);
    if (cached !== null) return cached;

    const startTime = Date.now();
    try {
      // Field limiting: select only needed columns
      const { data, error } = await this.client
        .from('order_snapshots')
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label')
        .eq('vendor_id', vendorId)
        .eq('square_order_id', squareOrderId)
        .maybeSingle();
      if (error) throw error;
      const result = data
        ? mapOrderSnapshotFromRow(data as Database['public']['Tables']['order_snapshots']['Row'])
        : null;
      queryCache.set(cacheKey, result);
      logQueryPerformance('getOrderSnapshotBySquareOrderId', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getOrderSnapshotBySquareOrderId', startTime, false, error);
      throw error;
    }
  }

  async listOrderSnapshotsForUser(vendorId: string, userId: string): Promise<OrderSnapshot[]> {
    const cacheKey = `orders:user:${vendorId}:${userId}`;
    const cached = queryCache.get<OrderSnapshot[]>(cacheKey);
    if (cached) return cached;

    const startTime = Date.now();
    try {
      // Field limiting: select only needed columns
      const { data, error } = await this.client
        .from('order_snapshots')
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label')
        .eq('vendor_id', vendorId)
        .eq('user_id', userId)
        .order('placed_at', { ascending: false });
      if (error) throw error;
      const result = (data ?? []).map(
        (row) => mapOrderSnapshotFromRow(row as Database['public']['Tables']['order_snapshots']['Row'])
      );
      queryCache.set(cacheKey, result);
      logQueryPerformance('listOrderSnapshotsForUser', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('listOrderSnapshotsForUser', startTime, false, error);
      throw error;
    }
  }

  async listOrderSnapshotsForVendor(vendorId: string): Promise<OrderSnapshot[]> {
    const cacheKey = `orders:vendor:${vendorId}`;
    const cached = queryCache.get<OrderSnapshot[]>(cacheKey);
    if (cached) return cached;

    const startTime = Date.now();
    try {
      // Field limiting: select only needed columns
      const { data, error } = await this.client
        .from('order_snapshots')
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label')
        .eq('vendor_id', vendorId)
        .order('placed_at', { ascending: false });
      if (error) throw error;
      const result = (data ?? []).map(
        (row) => mapOrderSnapshotFromRow(row as Database['public']['Tables']['order_snapshots']['Row'])
      );
      // Use short TTL (5 seconds) for vendor order list to ensure status updates appear quickly
      queryCache.set(cacheKey, result, 5 * 1000);
      logQueryPerformance('listOrderSnapshotsForVendor', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('listOrderSnapshotsForVendor', startTime, false, error);
      throw error;
    }
  }

  async updateOrderSnapshotStatus(
    orderId: string,
    vendorId: string,
    status: 'READY' | 'COMPLETE'
  ): Promise<OrderSnapshot> {
    const startTime = Date.now();
    try {
      // First verify the order exists and belongs to the vendor
      const { data: existing, error: fetchError } = await this.client
        .from('order_snapshots')
        .select('id,vendor_id')
        .eq('id', orderId)
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!existing) {
        throw new Error('Order not found or does not belong to vendor');
      }

      // Build update payload
      const updatePayload: Database['public']['Tables']['order_snapshots']['Update'] = {
        fulfillment_status: status
      };

      if (status === 'READY') {
        updatePayload.ready_at = new Date().toISOString();
      } else if (status === 'COMPLETE') {
        updatePayload.completed_at = new Date().toISOString();
      }

      // Update the order
      const { data, error } = await this.client
        .from('order_snapshots')
        .update(updatePayload)
        .eq('id', orderId)
        .eq('vendor_id', vendorId)
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label')
        .single();
      if (error) throw error;

      const result = mapOrderSnapshotFromRow(data as Database['public']['Tables']['order_snapshots']['Row']);

      // Invalidate related cache entries
      queryCache.delete(`order:${orderId}`);
      queryCache.delete(`orders:vendor:${vendorId}`);
      if (result.userId) {
        queryCache.delete(`orders:user:${vendorId}:${result.userId}`);
      }

      logQueryPerformance('updateOrderSnapshotStatus', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('updateOrderSnapshotStatus', startTime, false, error);
      throw error;
    }
  }

  async recordLoyaltyEntry(entry: LoyaltyLedgerEntryInput): Promise<LoyaltyLedgerEntry> {
    const startTime = Date.now();
    try {
      const withId = {
        ...entry,
        id: entry.id ?? randomUUID()
      };
      const { data, error } = await this.client
        .from('loyalty_ledger')
        .insert(toLoyaltyLedgerInsert(withId))
        .select('id,vendor_id,user_id,order_id,points_delta,created_at')
        .single();
      if (error) throw error;
      const result = mapLoyaltyLedgerFromRow(data as Database['public']['Tables']['loyalty_ledger']['Row']);
      // Invalidate related cache entries
      queryCache.delete(`loyalty:user:${result.vendorId}:${result.userId}`);
      logQueryPerformance('recordLoyaltyEntry', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('recordLoyaltyEntry', startTime, false, error);
      throw error;
    }
  }

  async listLoyaltyEntriesForUser(vendorId: string, userId: string): Promise<LoyaltyLedgerEntry[]> {
    const cacheKey = `loyalty:user:${vendorId}:${userId}`;
    const cached = queryCache.get<LoyaltyLedgerEntry[]>(cacheKey);
    if (cached) return cached;

    const startTime = Date.now();
    try {
      // Field limiting: select only needed columns
      const { data, error } = await this.client
        .from('loyalty_ledger')
        .select('id,vendor_id,user_id,order_id,points_delta,created_at')
        .eq('vendor_id', vendorId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const result = (data ?? []).map((row) =>
        mapLoyaltyLedgerFromRow(row as Database['public']['Tables']['loyalty_ledger']['Row'])
      );
      queryCache.set(cacheKey, result);
      logQueryPerformance('listLoyaltyEntriesForUser', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('listLoyaltyEntriesForUser', startTime, false, error);
      throw error;
    }
  }

  async getLoyaltyBalance(vendorId: string, userId: string): Promise<number> {
    const startTime = Date.now();
    try {
      // Batch: get entries and calculate balance in parallel if needed
      // For balance, we can optimize by using a sum query, but for now use existing method
      const entries = await this.listLoyaltyEntriesForUser(vendorId, userId);
      const balance = entries.reduce((sum, entry) => sum + entry.pointsDelta, 0);
      logQueryPerformance('getLoyaltyBalance', startTime, true);
      return balance;
    } catch (error) {
      logQueryPerformance('getLoyaltyBalance', startTime, false, error);
      throw error;
    }
  }

  async upsertPushDevice(device: PushDeviceInput): Promise<PushDevice> {
    const startTime = Date.now();
    try {
      const payload = toPushDeviceInsert({
        ...device,
        id: device.id ?? randomUUID()
      });
      const { data, error } = await this.client
        .from('push_devices')
        .upsert(payload, { onConflict: 'user_id,device_token' })
        .select('id,user_id,device_token,platform,created_at,updated_at')
        .single();
      if (error) throw error;
      const result = mapPushDeviceFromRow(data as Database['public']['Tables']['push_devices']['Row']);
      // Invalidate related cache entries
      queryCache.delete(`push_devices:user:${result.userId}`);
      logQueryPerformance('upsertPushDevice', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('upsertPushDevice', startTime, false, error);
      throw error;
    }
  }

  async listPushDevicesForUser(userId: string): Promise<PushDevice[]> {
    const cacheKey = `push_devices:user:${userId}`;
    const cached = queryCache.get<PushDevice[]>(cacheKey);
    if (cached) return cached;

    const startTime = Date.now();
    try {
      // Field limiting: select only needed columns
      const { data, error } = await this.client
        .from('push_devices')
        .select('id,user_id,device_token,platform,created_at,updated_at')
        .eq('user_id', userId);
      if (error) throw error;
      const result = (data ?? []).map((row) =>
        mapPushDeviceFromRow(row as Database['public']['Tables']['push_devices']['Row'])
      );
      queryCache.set(cacheKey, result);
      logQueryPerformance('listPushDevicesForUser', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('listPushDevicesForUser', startTime, false, error);
      throw error;
    }
  }

  // Helper method to invalidate cache when data changes
  invalidateCache(pattern?: string): void {
    if (pattern) {
      // In a production system, use a more sophisticated cache invalidation
      // For now, clear all cache entries matching the pattern
      queryCache.clear();
    } else {
      queryCache.clear();
    }
  }
}

const mapVendorFromRow = (row: Database['public']['Tables']['vendors']['Row']): Vendor => ({
  id: row.id,
  slug: row.slug,
  displayName: row.display_name,
  squareLocationId: row.square_location_id,
  squareCredentialRef: row.square_credential_ref ?? undefined,
  status: row.status ?? undefined,
  addressLine1: row.address_line1 ?? undefined,
  addressLine2: row.address_line2 ?? undefined,
  city: row.city ?? undefined,
  state: row.state ?? undefined,
  postalCode: row.postal_code ?? undefined,
  phone: row.phone ?? undefined,
  timezone: row.timezone ?? undefined,
  pickupInstructions: row.pickup_instructions ?? undefined
});

const mapOrderSnapshotFromRow = (
  row: Database['public']['Tables']['order_snapshots']['Row']
): OrderSnapshot => ({
  id: row.id,
  vendorId: row.vendor_id,
  userId: row.user_id,
  squareOrderId: row.square_order_id,
  placedAt: row.placed_at,
  snapshotJson: row.snapshot_json,
  fulfillmentStatus: row.fulfillment_status ?? undefined,
  readyAt: row.ready_at ?? undefined,
  completedAt: row.completed_at ?? undefined,
  updatedAt: row.updated_at ?? undefined,
  customerDisplayName: row.customer_display_name ?? undefined,
  pickupLabel: row.pickup_label ?? undefined
});

const mapLoyaltyLedgerFromRow = (
  row: Database['public']['Tables']['loyalty_ledger']['Row']
): LoyaltyLedgerEntry => ({
  id: row.id,
  vendorId: row.vendor_id,
  userId: row.user_id,
  orderId: row.order_id,
  pointsDelta: row.points_delta,
  createdAt: row.created_at
});

const mapPushDeviceFromRow = (
  row: Database['public']['Tables']['push_devices']['Row']
): PushDevice => ({
  id: row.id,
  userId: row.user_id,
  deviceToken: row.device_token,
  platform: row.platform as PushDevice['platform'],
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined
});

const toOrderSnapshotInsert = (
  order: OrderSnapshotInput
): Database['public']['Tables']['order_snapshots']['Insert'] => ({
  id: order.id,
  vendor_id: order.vendorId,
  user_id: order.userId ?? null,
  square_order_id: order.squareOrderId,
  placed_at: order.placedAt ?? new Date().toISOString(),
  snapshot_json: order.snapshotJson,
  fulfillment_status: order.fulfillmentStatus ?? 'PLACED',
  ready_at: order.readyAt ?? null,
  completed_at: order.completedAt ?? null,
  // omit updated_at so DB default/trigger populates it
  customer_display_name: order.customerDisplayName ?? null,
  pickup_label: order.pickupLabel ?? null
});

const toLoyaltyLedgerInsert = (
  entry: LoyaltyLedgerEntryInput
): Database['public']['Tables']['loyalty_ledger']['Insert'] => ({
  id: entry.id,
  vendor_id: entry.vendorId,
  user_id: entry.userId,
  order_id: entry.orderId,
  points_delta: entry.pointsDelta,
  created_at: entry.createdAt ?? new Date().toISOString()
});

const toPushDeviceInsert = (
  device: PushDeviceInput
): Database['public']['Tables']['push_devices']['Insert'] => ({
  id: device.id,
  user_id: device.userId,
  device_token: device.deviceToken,
  platform: device.platform,
  created_at: device.createdAt ?? new Date().toISOString(),
  updated_at: device.updatedAt ?? new Date().toISOString()
});

const mapAuthUser = (user: SupabaseAuthUser): User => {
  const provider = (user.app_metadata?.provider as User['provider']) ?? 'apple';
  const providerUserId =
    (user.identities?.[0]?.id ?? user.user_metadata?.sub ?? user.id) as string;
  return {
    id: user.id,
    provider,
    providerUserId,
    displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined
  };
};

const mapAuthUserNullable = (user: SupabaseAuthUser | null): User | null => {
  if (!user) return null;
  return mapAuthUser(user);
};
