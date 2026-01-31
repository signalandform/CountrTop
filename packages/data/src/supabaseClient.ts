import { randomUUID, createHash } from 'crypto';
import { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';

import { DataClient, LoyaltyLedgerEntryInput, OrderSnapshotInput, PushDeviceInput } from './dataClient';
import {
  AovPoint,
  CustomerSummary,
  CustomerLtvPoint,
  RepeatCustomerMetrics,
  ItemPerformance,
  KitchenTicket,
  KitchenTicketStatus,
  KitchenTicketWithOrder,
  KdsSummary,
  KdsThroughputPoint,
  KdsPrepTimePoint,
  KdsHeatmapCell,
  KdsSourceMetrics,
  LoyaltyLedgerEntry,
  OrderSnapshot,
  PairingToken,
  PushDevice,
  RevenueBySource,
  RevenuePoint,
  SquareOrder,
  User,
  Vendor,
  VendorLocation,
  VendorStatus
} from './models';
import { assignShortcode } from './shortcodes';

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

/**
 * Recursively converts BigInt values to strings for JSON serialization
 * Preserves null, undefined, and all other types
 * Does NOT mutate the original object (creates a new structure)
 */
function safeJson(value: unknown): unknown {
  // Handle null and undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle BigInt
  if (typeof value === 'bigint') {
    return value.toString();
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(item => safeJson(item));
  }

  // Handle objects
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = safeJson(val);
    }
    return result;
  }

  // Handle primitives (string, number, boolean, etc.)
  return value;
}

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
          kds_active_limit_total: number | null;
          kds_active_limit_ct: number | null;
          // Theming columns
          logo_url: string | null;
          primary_color: string | null;
          accent_color: string | null;
          font_family: string | null;
          review_url: string | null;
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
          kds_active_limit_total?: number | null;
          kds_active_limit_ct?: number | null;
          // Theming columns
          logo_url?: string | null;
          primary_color?: string | null;
          accent_color?: string | null;
          font_family?: string | null;
          review_url?: string | null;
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
          customer_feedback_rating: string | null;
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
          customer_feedback_rating?: string | null;
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
      square_orders: {
        Row: {
          square_order_id: string;
          location_id: string;
          pos_provider: string;
          state: string;
          created_at: string;
          updated_at: string;
          reference_id: string | null;
          metadata: Record<string, unknown> | null;
          line_items: unknown[] | null;
          fulfillment: Record<string, unknown> | null;
          source: 'countrtop_online' | 'square_pos' | 'toast_pos' | 'clover_pos' | 'pos';
          raw: Record<string, unknown> | null;
        };
        Insert: {
          square_order_id: string;
          location_id: string;
          pos_provider?: string;
          state: string;
          created_at?: string;
          updated_at?: string;
          reference_id?: string | null;
          metadata?: Record<string, unknown> | null;
          line_items?: unknown[] | null;
          fulfillment?: Record<string, unknown> | null;
          source: 'countrtop_online' | 'square_pos' | 'toast_pos' | 'clover_pos' | 'pos';
          raw?: Record<string, unknown> | null;
        };
        Update: Partial<Database['public']['Tables']['square_orders']['Insert']>;
        Relationships: [];
      };
      kitchen_tickets: {
        Row: {
          id: string;
          square_order_id: string;
          location_id: string;
          pos_provider: string;
          ct_reference_id: string | null;
          customer_user_id: string | null;
          source: 'countrtop_online' | 'square_pos' | 'toast_pos' | 'clover_pos' | 'pos';
          status: 'placed' | 'preparing' | 'ready' | 'completed' | 'canceled';
          shortcode: string | null;
          promoted_at: string | null;
          placed_at: string;
          ready_at: string | null;
          completed_at: string | null;
          canceled_at: string | null;
          last_updated_by_vendor_user_id: string | null;
          updated_at: string;
          // Hold/notes/reorder features
          held_at: string | null;
          held_reason: string | null;
          staff_notes: string | null;
          custom_label: string | null;
          priority_order: number;
        };
        Insert: {
          id?: string;
          square_order_id: string;
          location_id: string;
          pos_provider?: string;
          ct_reference_id?: string | null;
          customer_user_id?: string | null;
          source: 'countrtop_online' | 'square_pos' | 'toast_pos' | 'clover_pos' | 'pos';
          status: 'placed' | 'preparing' | 'ready' | 'completed' | 'canceled';
          shortcode?: string | null;
          promoted_at?: string | null;
          placed_at?: string;
          ready_at?: string | null;
          completed_at?: string | null;
          canceled_at?: string | null;
          last_updated_by_vendor_user_id?: string | null;
          updated_at?: string;
          // Hold/notes/reorder features
          held_at?: string | null;
          held_reason?: string | null;
          staff_notes?: string | null;
          custom_label?: string | null;
          priority_order?: number;
        };
        Update: Partial<Database['public']['Tables']['kitchen_tickets']['Insert']>;
        Relationships: [];
      };
      vendor_feature_flags: {
        Row: {
          id: string;
          vendor_id: string;
          feature_key: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          feature_key: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['vendor_feature_flags']['Insert']>;
        Relationships: [];
      };
      vendor_location_pins: {
        Row: {
          id: string;
          vendor_id: string;
          location_id: string;
          pin_hash: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          location_id: string;
          pin_hash: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['vendor_location_pins']['Insert']>;
        Relationships: [];
      };
      kds_pairing_tokens: {
        Row: {
          id: string;
          vendor_id: string;
          location_id: string | null;
          token_hash: string;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          location_id?: string | null;
          token_hash: string;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['kds_pairing_tokens']['Insert']>;
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          vendor_id: string;
          name: string;
          pin: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          pin: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['employees']['Insert']>;
        Relationships: [];
      };
      time_entries: {
        Row: {
          id: string;
          vendor_id: string;
          employee_id: string;
          clock_in_at: string;
          clock_out_at: string | null;
          location_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          employee_id: string;
          clock_in_at?: string;
          clock_out_at?: string | null;
          location_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['time_entries']['Insert']>;
        Relationships: [];
      };
      vendor_locations: {
        Row: {
          id: string;
          vendor_id: string;
          square_location_id: string;
          pos_provider: string;
          name: string;
          is_primary: boolean;
          is_active: boolean;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          phone: string | null;
          timezone: string | null;
          pickup_instructions: string | null;
          online_ordering_enabled: boolean;
          kds_active_limit_total: number | null;
          kds_active_limit_ct: number | null;
          kds_auto_bump_minutes: number | null;
          kds_sound_alerts_enabled: boolean;
          kds_display_mode: string;
          online_ordering_lead_time_minutes: number;
          online_ordering_hours_json: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          square_location_id: string;
          pos_provider?: string;
          name: string;
          is_primary?: boolean;
          is_active?: boolean;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          phone?: string | null;
          timezone?: string | null;
          pickup_instructions?: string | null;
          online_ordering_enabled?: boolean;
          kds_active_limit_total?: number | null;
          kds_active_limit_ct?: number | null;
          kds_auto_bump_minutes?: number | null;
          kds_sound_alerts_enabled?: boolean;
          kds_display_mode?: string;
          online_ordering_lead_time_minutes?: number;
          online_ordering_hours_json?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['vendor_locations']['Insert']>;
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
      // Field limiting: only select needed columns (including theming fields)
      const { data, error } = await this.client
        .from('vendors')
        .select('id,slug,display_name,square_location_id,square_credential_ref,status,address_line1,address_line2,city,state,postal_code,phone,timezone,pickup_instructions,kds_active_limit_total,kds_active_limit_ct,logo_url,primary_color,accent_color,font_family,review_url')
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
      // Field limiting: only select needed columns (including theming fields)
      const { data, error } = await this.client
        .from('vendors')
        .select('id,slug,display_name,square_location_id,square_credential_ref,status,address_line1,address_line2,city,state,postal_code,phone,timezone,pickup_instructions,kds_active_limit_total,kds_active_limit_ct,logo_url,primary_color,accent_color,font_family,review_url')
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
      // Field limiting: only select needed columns (including theming fields)
      const { data, error } = await this.client
        .from('vendors')
        .select('id,slug,display_name,square_location_id,square_credential_ref,status,address_line1,address_line2,city,state,postal_code,phone,timezone,pickup_instructions,kds_active_limit_total,kds_active_limit_ct,logo_url,primary_color,accent_color,font_family,review_url')
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

  // --- Vendor Locations ---

  async listVendorLocations(vendorId: string, includeInactive = false): Promise<VendorLocation[]> {
    const startTime = Date.now();
    try {
      let query = this.client
        .from('vendor_locations')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('is_primary', { ascending: false })
        .order('name', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      logQueryPerformance('listVendorLocations', startTime, true);
      return (data || []).map(row => 
        mapVendorLocationFromRow(row as Database['public']['Tables']['vendor_locations']['Row'])
      );
    } catch (error) {
      logQueryPerformance('listVendorLocations', startTime, false, error);
      throw error;
    }
  }

  async getVendorLocationBySquareId(squareLocationId: string): Promise<VendorLocation | null> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('vendor_locations')
        .select('*')
        .eq('square_location_id', squareLocationId)
        .maybeSingle();

      if (error) throw error;

      logQueryPerformance('getVendorLocationBySquareId', startTime, true);
      return data ? mapVendorLocationFromRow(data as Database['public']['Tables']['vendor_locations']['Row']) : null;
    } catch (error) {
      logQueryPerformance('getVendorLocationBySquareId', startTime, false, error);
      throw error;
    }
  }

  async getVendorLocationById(locationId: string): Promise<VendorLocation | null> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('vendor_locations')
        .select('*')
        .eq('id', locationId)
        .maybeSingle();

      if (error) throw error;

      logQueryPerformance('getVendorLocationById', startTime, true);
      return data ? mapVendorLocationFromRow(data as Database['public']['Tables']['vendor_locations']['Row']) : null;
    } catch (error) {
      logQueryPerformance('getVendorLocationById', startTime, false, error);
      throw error;
    }
  }

  async createVendorLocation(location: Omit<VendorLocation, 'id' | 'createdAt' | 'updatedAt'>): Promise<VendorLocation> {
    const startTime = Date.now();
    try {
      const insertData: Database['public']['Tables']['vendor_locations']['Insert'] = {
        vendor_id: location.vendorId,
        // Use externalLocationId if provided, fall back to squareLocationId for backward compatibility
        square_location_id: location.externalLocationId ?? location.squareLocationId,
        pos_provider: location.posProvider ?? 'square',
        name: location.name,
        is_primary: location.isPrimary,
        is_active: location.isActive,
        address_line1: location.addressLine1 ?? null,
        address_line2: location.addressLine2 ?? null,
        city: location.city ?? null,
        state: location.state ?? null,
        postal_code: location.postalCode ?? null,
        phone: location.phone ?? null,
        timezone: location.timezone ?? null,
        pickup_instructions: location.pickupInstructions ?? null,
        online_ordering_enabled: location.onlineOrderingEnabled,
        kds_active_limit_total: location.kdsActiveLimitTotal ?? null,
        kds_active_limit_ct: location.kdsActiveLimitCt ?? null,
        kds_auto_bump_minutes: location.kdsAutoBumpMinutes ?? null,
        kds_sound_alerts_enabled: location.kdsSoundAlertsEnabled ?? true,
        kds_display_mode: location.kdsDisplayMode ?? 'grid',
        online_ordering_lead_time_minutes: location.onlineOrderingLeadTimeMinutes ?? 15,
        online_ordering_hours_json: location.onlineOrderingHoursJson ?? null,
      };

      const { data, error } = await this.client
        .from('vendor_locations')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      logQueryPerformance('createVendorLocation', startTime, true);
      return mapVendorLocationFromRow(data as Database['public']['Tables']['vendor_locations']['Row']);
    } catch (error) {
      logQueryPerformance('createVendorLocation', startTime, false, error);
      throw error;
    }
  }

  async updateVendorLocation(
    locationId: string,
    updates: Partial<Omit<VendorLocation, 'id' | 'vendorId' | 'squareLocationId' | 'createdAt' | 'updatedAt'>>
  ): Promise<VendorLocation> {
    const startTime = Date.now();
    try {
      const updateData: Database['public']['Tables']['vendor_locations']['Update'] = {
        updated_at: new Date().toISOString(),
      };

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.isPrimary !== undefined) updateData.is_primary = updates.isPrimary;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      if (updates.addressLine1 !== undefined) updateData.address_line1 = updates.addressLine1 ?? null;
      if (updates.addressLine2 !== undefined) updateData.address_line2 = updates.addressLine2 ?? null;
      if (updates.city !== undefined) updateData.city = updates.city ?? null;
      if (updates.state !== undefined) updateData.state = updates.state ?? null;
      if (updates.postalCode !== undefined) updateData.postal_code = updates.postalCode ?? null;
      if (updates.phone !== undefined) updateData.phone = updates.phone ?? null;
      if (updates.timezone !== undefined) updateData.timezone = updates.timezone ?? null;
      if (updates.pickupInstructions !== undefined) updateData.pickup_instructions = updates.pickupInstructions ?? null;
      if (updates.onlineOrderingEnabled !== undefined) updateData.online_ordering_enabled = updates.onlineOrderingEnabled;
      if (updates.kdsActiveLimitTotal !== undefined) updateData.kds_active_limit_total = updates.kdsActiveLimitTotal ?? null;
      if (updates.kdsActiveLimitCt !== undefined) updateData.kds_active_limit_ct = updates.kdsActiveLimitCt ?? null;
      if (updates.kdsAutoBumpMinutes !== undefined) updateData.kds_auto_bump_minutes = updates.kdsAutoBumpMinutes ?? null;
      if (updates.kdsSoundAlertsEnabled !== undefined) updateData.kds_sound_alerts_enabled = updates.kdsSoundAlertsEnabled;
      if (updates.kdsDisplayMode !== undefined) updateData.kds_display_mode = updates.kdsDisplayMode;
      if (updates.onlineOrderingLeadTimeMinutes !== undefined) updateData.online_ordering_lead_time_minutes = updates.onlineOrderingLeadTimeMinutes;
      if (updates.onlineOrderingHoursJson !== undefined) updateData.online_ordering_hours_json = updates.onlineOrderingHoursJson ?? null;

      const { data, error } = await this.client
        .from('vendor_locations')
        .update(updateData)
        .eq('id', locationId)
        .select()
        .single();

      if (error) throw error;

      logQueryPerformance('updateVendorLocation', startTime, true);
      return mapVendorLocationFromRow(data as Database['public']['Tables']['vendor_locations']['Row']);
    } catch (error) {
      logQueryPerformance('updateVendorLocation', startTime, false, error);
      throw error;
    }
  }

  async deleteVendorLocation(locationId: string): Promise<void> {
    const startTime = Date.now();
    try {
      const { error } = await this.client
        .from('vendor_locations')
        .delete()
        .eq('id', locationId);

      if (error) throw error;

      logQueryPerformance('deleteVendorLocation', startTime, true);
    } catch (error) {
      logQueryPerformance('deleteVendorLocation', startTime, false, error);
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
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label,customer_feedback_rating')
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
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label,customer_feedback_rating')
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
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label,customer_feedback_rating')
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
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label,customer_feedback_rating')
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
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label,customer_feedback_rating')
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
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label,customer_feedback_rating')
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

  async updateOrderSnapshotFeedback(
    snapshotId: string,
    rating: 'thumbs_up' | 'thumbs_down'
  ): Promise<OrderSnapshot> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('order_snapshots')
        .update({ customer_feedback_rating: rating })
        .eq('id', snapshotId)
        .select('id,vendor_id,user_id,square_order_id,placed_at,snapshot_json,fulfillment_status,ready_at,completed_at,updated_at,customer_display_name,pickup_label,customer_feedback_rating')
        .single();
      if (error) throw error;
      const result = mapOrderSnapshotFromRow(data as Database['public']['Tables']['order_snapshots']['Row']);
      queryCache.delete(`order:${snapshotId}`);
      queryCache.delete(`orders:vendor:${result.vendorId}`);
      if (result.userId) {
        queryCache.delete(`orders:user:${result.vendorId}:${result.userId}`);
      }
      logQueryPerformance('updateOrderSnapshotFeedback', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('updateOrderSnapshotFeedback', startTime, false, error);
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

  // ============================================================================
  // KDS: Square Orders Mirror + Kitchen Tickets
  // ============================================================================

  /**
   * Derives source attribution from Square order referenceId and source.name
   */
  private deriveSource(order: Record<string, unknown>): 'countrtop_online' | 'square_pos' {
    const referenceId = typeof order.referenceId === 'string' ? order.referenceId : null;
    
    // CountrTop online orders have referenceId starting with "ct_"
    if (referenceId && referenceId.startsWith('ct_')) {
      return 'countrtop_online';
    }
    
    // Default fallback to square_pos (includes POS, delivery services, etc.)
    return 'square_pos';
  }

  /**
   * Upserts a Square order into the square_orders table
   */
  async upsertSquareOrderFromSquare(order: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    try {
      // Extract and validate order properties with type guards
      const referenceId = typeof order.referenceId === 'string' ? order.referenceId : null;
      const source = this.deriveSource(order);
      const orderId = typeof order.id === 'string' ? order.id : '';
      const locationId = typeof order.locationId === 'string' ? order.locationId : '';
      const state = typeof order.state === 'string' ? order.state : '';
      const createdAt = typeof order.createdAt === 'string' ? order.createdAt : new Date().toISOString();
      const updatedAt = typeof order.updatedAt === 'string' ? order.updatedAt : (typeof order.createdAt === 'string' ? order.createdAt : new Date().toISOString());

      // Convert all jsonb fields to safe JSON (BigInt -> string)
      const safeMetadata = order.metadata ? safeJson(order.metadata) : null;
      const safeLineItems = order.lineItems ? safeJson(order.lineItems) : null;
      const safeFulfillment = (order.fulfillments ?? order.fulfillment) ? safeJson(order.fulfillments ?? order.fulfillment) : null;
      const safeRaw = safeJson(order);

      const payload: Database['public']['Tables']['square_orders']['Insert'] = {
        square_order_id: orderId,
        location_id: locationId,
        state,
        created_at: createdAt,
        updated_at: updatedAt,
        reference_id: referenceId,
        metadata: safeMetadata as Record<string, unknown> | null,
        line_items: safeLineItems as unknown[] | null,
        fulfillment: safeFulfillment as Record<string, unknown> | null,
        source,
        raw: safeRaw as Record<string, unknown> | null
      };

      const { error } = await this.client
        .from('square_orders')
        .upsert(payload, { onConflict: 'square_order_id' });

      if (error) throw error;
      logQueryPerformance('upsertSquareOrderFromSquare', startTime, true);
    } catch (error) {
      logQueryPerformance('upsertSquareOrderFromSquare', startTime, false, error);
      throw error;
    }
  }

  /**
   * Ensures a kitchen ticket exists for an OPEN order
   * Only creates ticket if order.state === 'OPEN'
   * Does NOT overwrite existing ticket status (CountrTop-owned)
   */
  async ensureKitchenTicketForOpenOrder(order: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    try {
      // Only process OPEN orders
      if (order.state !== 'OPEN') {
        return;
      }

      const referenceId = typeof order.referenceId === 'string' ? order.referenceId : null;
      const source = this.deriveSource(order);
      
      // Extract customer_user_id from metadata if present
      let customerUserId: string | null = null;
      const metadata = order.metadata;
      if (metadata && typeof metadata === 'object' && 'ct_user_id' in metadata) {
        const userId = metadata.ct_user_id;
        // Validate it looks like a UUID
        if (typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
          customerUserId = userId;
        }
      }

      // Determine placed_at timestamp (use best available)
      const openedAt = typeof order.openedAt === 'string' ? order.openedAt : null;
      const orderCreatedAt = typeof order.createdAt === 'string' ? order.createdAt : null;
      const placedAt = openedAt ?? orderCreatedAt ?? new Date().toISOString();

      // Check if ticket already exists
      const orderId = typeof order.id === 'string' ? order.id : '';
      const { data: existingTicket } = await this.client
        .from('kitchen_tickets')
        .select('id, status, ct_reference_id, customer_user_id')
        .eq('square_order_id', orderId)
        .maybeSingle();

      if (existingTicket) {
        // Ticket exists - only update safe fields, preserve status
        const updatePayload: Database['public']['Tables']['kitchen_tickets']['Update'] & {
          ct_reference_id?: string | null;
          customer_user_id?: string | null;
        } = {
          updated_at: new Date().toISOString()
        };

        // Only update these if they're currently null
        if (!existingTicket.ct_reference_id && referenceId && referenceId.startsWith('ct_')) {
          updatePayload.ct_reference_id = referenceId;
        }
        if (!existingTicket.customer_user_id && customerUserId) {
          updatePayload.customer_user_id = customerUserId;
        }

        // Only update if there are fields to update
        if (Object.keys(updatePayload).length > 1) {
          const { error } = await this.client
            .from('kitchen_tickets')
            .update(updatePayload)
            .eq('square_order_id', orderId);

          if (error) throw error;
        }
      } else {
        // Create new ticket
        const ticketLocationId = typeof order.locationId === 'string' ? order.locationId : '';
        const insertPayload: Database['public']['Tables']['kitchen_tickets']['Insert'] = {
          square_order_id: orderId,
          location_id: ticketLocationId,
          ct_reference_id: referenceId && referenceId.startsWith('ct_') ? referenceId : null,
          customer_user_id: customerUserId,
          source,
          status: 'placed',
          placed_at: placedAt,
          updated_at: new Date().toISOString()
        };

        const { error } = await this.client
          .from('kitchen_tickets')
          .insert(insertPayload);

        if (error) throw error;
      }

      logQueryPerformance('ensureKitchenTicketForOpenOrder', startTime, true);
    } catch (error) {
      logQueryPerformance('ensureKitchenTicketForOpenOrder', startTime, false, error);
      throw error;
    }
  }

  /**
   * Updates kitchen ticket status for terminal order states (COMPLETED, CANCELED)
   */
  async updateTicketForTerminalOrderState(order: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    try {
      const orderState = typeof order.state === 'string' ? order.state : '';
      if (orderState !== 'COMPLETED' && orderState !== 'CANCELED') {
        return;
      }

      // Find existing ticket
      const orderId = typeof order.id === 'string' ? order.id : '';
      const { data: ticket } = await this.client
        .from('kitchen_tickets')
        .select('id, status')
        .eq('square_order_id', orderId)
        .maybeSingle();

      if (!ticket) {
        // No ticket exists, nothing to update
        return;
      }

      // Don't overwrite if already in terminal state
      if (ticket.status === 'completed' || ticket.status === 'canceled') {
        return;
      }

      const now = new Date().toISOString();
      const updatePayload: Database['public']['Tables']['kitchen_tickets']['Update'] = {
        updated_at: now
      };

      if (orderState === 'COMPLETED') {
        updatePayload.status = 'completed';
        updatePayload.completed_at = now;
      } else if (orderState === 'CANCELED') {
        updatePayload.status = 'canceled';
        updatePayload.canceled_at = now;
      }

      const { error } = await this.client
        .from('kitchen_tickets')
        .update(updatePayload)
        .eq('square_order_id', orderId);

      if (error) throw error;
      logQueryPerformance('updateTicketForTerminalOrderState', startTime, true);
    } catch (error) {
      logQueryPerformance('updateTicketForTerminalOrderState', startTime, false, error);
      throw error;
    }
  }

  // ============================================================================
  // KDS: Queue Management
  // ============================================================================

  /**
   * Lists active kitchen tickets for a location with their associated Square orders
   */
  async listActiveKitchenTickets(locationId: string): Promise<KitchenTicketWithOrder[]> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('kitchen_tickets')
        .select(`
          id,
          square_order_id,
          location_id,
          ct_reference_id,
          customer_user_id,
          source,
          status,
          shortcode,
          promoted_at,
          placed_at,
          ready_at,
          completed_at,
          canceled_at,
          last_updated_by_vendor_user_id,
          updated_at,
          held_at,
          held_reason,
          staff_notes,
          custom_label,
          priority_order,
          square_orders (
            square_order_id,
            location_id,
            state,
            created_at,
            updated_at,
            reference_id,
            metadata,
            line_items,
            fulfillment,
            source
          )
        `)
        .eq('location_id', locationId)
        .in('status', ['placed', 'ready', 'preparing'])
        .order('priority_order', { ascending: true })
        .order('placed_at', { ascending: true });

      if (error) throw error;

      if (!data) {
        return [];
      }

      // Map results to composite type
      const results: KitchenTicketWithOrder[] = [];
      for (const row of data) {
        const ticket = mapKitchenTicketFromRow(row as Database['public']['Tables']['kitchen_tickets']['Row']);
        
        // Handle nested square_orders (can be null or array)
        let order: SquareOrder | null = null;
        const rowWithOrders = row as Database['public']['Tables']['kitchen_tickets']['Row'] & {
          square_orders?: Database['public']['Tables']['square_orders']['Row'] | Database['public']['Tables']['square_orders']['Row'][];
        };
        const orderData = rowWithOrders.square_orders;
        if (orderData) {
          // Supabase returns nested data as array or single object depending on relationship
          const orderRow = Array.isArray(orderData) ? orderData[0] : orderData;
          if (orderRow) {
            order = mapSquareOrderFromRow(orderRow as Database['public']['Tables']['square_orders']['Row']);
          }
        }

        // Only include if we have both ticket and order
        if (order) {
          results.push({ ticket, order });
        } else {
          // Log warning but don't fail - this should be rare
          console.warn(`Kitchen ticket ${ticket.id} has no associated Square order`);
        }
      }

      logQueryPerformance('listActiveKitchenTickets', startTime, true);
      return results;
    } catch (error) {
      logQueryPerformance('listActiveKitchenTickets', startTime, false, error);
      throw error;
    }
  }

  /**
   * Updates kitchen ticket status with validation
   */
  async updateKitchenTicketStatus(
    ticketId: string,
    status: 'ready' | 'completed',
    vendorUserId?: string
  ): Promise<KitchenTicket> {
    const startTime = Date.now();
    try {
      // First, fetch the current ticket to validate transition
      const { data: currentTicket, error: fetchError } = await this.client
        .from('kitchen_tickets')
        .select('id, status')
        .eq('id', ticketId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!currentTicket) {
        throw new Error(`Kitchen ticket ${ticketId} not found`);
      }

      // Validate status transition
      const currentStatus = currentTicket.status;
      const validTransitions: Record<string, string[]> = {
        placed: ['preparing', 'ready'],
        preparing: ['ready'],
        ready: ['completed']
      };

      if (!validTransitions[currentStatus]?.includes(status)) {
        throw new Error(
          `Invalid status transition: ${currentStatus} -> ${status}. ` +
          `Valid transitions: ${Object.entries(validTransitions)
            .map(([from, to]) => `${from} -> ${to.join('/')}`)
            .join(', ')}`
        );
      }

      // Prepare update payload
      const now = new Date().toISOString();
      const updatePayload: Database['public']['Tables']['kitchen_tickets']['Update'] & {
        ready_at?: string | null;
        completed_at?: string | null;
        last_updated_by_vendor_user_id?: string | null;
      } = {
        status,
        updated_at: now
      };

      if (status === 'ready' && currentStatus !== 'ready') {
        updatePayload.ready_at = now;
      }

      if (status === 'completed') {
        updatePayload.completed_at = now;
      }

      if (vendorUserId) {
        updatePayload.last_updated_by_vendor_user_id = vendorUserId;
      }

      // Update ticket
      const { data: updatedTicket, error: updateError } = await this.client
        .from('kitchen_tickets')
        .update(updatePayload)
        .eq('id', ticketId)
        .select()
        .single();

      if (updateError) throw updateError;
      if (!updatedTicket) {
        throw new Error(`Failed to update kitchen ticket ${ticketId}`);
      }

      const result = mapKitchenTicketFromRow(updatedTicket as Database['public']['Tables']['kitchen_tickets']['Row']);
      logQueryPerformance('updateKitchenTicketStatus', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('updateKitchenTicketStatus', startTime, false, error);
      throw error;
    }
  }

  /**
   * Lists queued tickets (placed but not yet promoted) for a location
   */
  async listQueuedTickets(locationId: string): Promise<KitchenTicket[]> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('kitchen_tickets')
        .select('*')
        .eq('location_id', locationId)
        .eq('status', 'placed')
        .is('promoted_at', null)
        .order('placed_at', { ascending: true });

      if (error) throw error;

      const results = (data || []).map(row => mapKitchenTicketFromRow(row as Database['public']['Tables']['kitchen_tickets']['Row']));
      logQueryPerformance('listQueuedTickets', startTime, true);
      return results;
    } catch (error) {
      logQueryPerformance('listQueuedTickets', startTime, false, error);
      throw error;
    }
  }

  /**
   * Promotes the oldest queued ticket to active if there's capacity
   * Returns the promoted ticket or null if no promotion occurred
   */
  async promoteQueuedTicket(locationId: string, vendor: Vendor): Promise<KitchenTicket | null> {
    const startTime = Date.now();
    try {
      // Get vendor limits (default to 10 if not set)
      const limitTotal = vendor.kdsActiveLimitTotal ?? 10;
      const limitCt = vendor.kdsActiveLimitCt ?? 10;

      // Count active tickets (promoted and not completed/canceled)
      const { count: activeCount, error: countError } = await this.client
        .from('kitchen_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('location_id', locationId)
        .in('status', ['placed', 'preparing', 'ready'])
        .not('promoted_at', 'is', null);

      if (countError) throw countError;

      // Check if we're at capacity
      if (activeCount !== null && activeCount >= limitTotal) {
        logQueryPerformance('promoteQueuedTicket', startTime, true);
        return null; // At capacity, no promotion
      }

      // Get all active tickets to check CountrTop limit
      const { data: activeTickets, error: activeError } = await this.client
        .from('kitchen_tickets')
        .select('source')
        .eq('location_id', locationId)
        .in('status', ['placed', 'preparing', 'ready'])
        .not('promoted_at', 'is', null);

      if (activeError) throw activeError;

      const activeCtCount = (activeTickets || []).filter(t => t.source === 'countrtop_online').length;

      // Find oldest queued ticket
      const { data: queuedTickets, error: queueError } = await this.client
        .from('kitchen_tickets')
        .select('*')
        .eq('location_id', locationId)
        .eq('status', 'placed')
        .is('promoted_at', null)
        .order('placed_at', { ascending: true })
        .limit(1);

      if (queueError) throw queueError;

      if (!queuedTickets || queuedTickets.length === 0) {
        logQueryPerformance('promoteQueuedTicket', startTime, true);
        return null; // No queued tickets
      }

      const ticketToPromote = queuedTickets[0] as Database['public']['Tables']['kitchen_tickets']['Row'];
      const ticketSource = ticketToPromote.source as 'countrtop_online' | 'square_pos';

      // Check CountrTop limit if this is a CountrTop order
      if (ticketSource === 'countrtop_online' && activeCtCount >= limitCt) {
        logQueryPerformance('promoteQueuedTicket', startTime, true);
        return null; // CountrTop limit reached
      }

      // Get all existing shortcodes for this location to assign a unique one
      const { data: allTickets, error: allTicketsError } = await this.client
        .from('kitchen_tickets')
        .select('shortcode')
        .eq('location_id', locationId)
        .not('shortcode', 'is', null);

      if (allTicketsError) throw allTicketsError;

      const existingShortcodes = (allTickets || [])
        .map(t => t.shortcode)
        .filter((code): code is string => typeof code === 'string');

      // Assign shortcode
      const shortcode = assignShortcode(locationId, ticketSource, existingShortcodes);

      // If shortcode assignment failed (e.g., DS already taken), don't promote
      if (!shortcode) {
        logQueryPerformance('promoteQueuedTicket', startTime, true);
        return null;
      }

      // Promote the ticket
      const now = new Date().toISOString();
      const { data: promotedTicket, error: promoteError } = await this.client
        .from('kitchen_tickets')
        .update({
          shortcode,
          promoted_at: now,
          updated_at: now
        })
        .eq('id', ticketToPromote.id)
        .select()
        .single();

      if (promoteError) throw promoteError;
      if (!promotedTicket) {
        throw new Error(`Failed to promote ticket ${ticketToPromote.id}`);
      }

      const result = mapKitchenTicketFromRow(promotedTicket as Database['public']['Tables']['kitchen_tickets']['Row']);
      logQueryPerformance('promoteQueuedTicket', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('promoteQueuedTicket', startTime, false, error);
      throw error;
    }
  }

  // ============================================================================
  // KDS: Analytics (Milestone 9)
  // ============================================================================

  /**
   * Gets KDS summary metrics for a location and date range
   */
  async getKdsSummary(
    locationId: string,
    startDate: Date,
    endDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timezone: string
  ): Promise<KdsSummary> {
    const startTime = Date.now();
    try {
      // Fetch tickets in date range
      const { data: tickets, error } = await this.client
        .from('kitchen_tickets')
        .select('status, placed_at, ready_at, completed_at, canceled_at')
        .eq('location_id', locationId)
        .gte('placed_at', startDate.toISOString())
        .lte('placed_at', endDate.toISOString());

      if (error) throw error;

      const ticketsData = tickets || [];

      // Calculate totals
      const totals = {
        ticketsPlaced: ticketsData.length,
        ticketsReady: ticketsData.filter(t => t.ready_at).length,
        ticketsCompleted: ticketsData.filter(t => t.completed_at).length,
        ticketsCanceled: ticketsData.filter(t => t.canceled_at).length
      };

      // Calculate averages (null-safe)
      const readyTickets = ticketsData.filter(t => t.ready_at && t.placed_at);
      const prepTimeMinutes = readyTickets.length > 0
        ? readyTickets.reduce((sum, t) => {
            const placed = new Date(t.placed_at).getTime();
            const ready = new Date(t.ready_at!).getTime();
            return sum + (ready - placed) / (1000 * 60);
          }, 0) / readyTickets.length
        : null;

      const completedTickets = ticketsData.filter(t => t.completed_at && t.placed_at);
      const totalTimeMinutes = completedTickets.length > 0
        ? completedTickets.reduce((sum, t) => {
            const placed = new Date(t.placed_at).getTime();
            const completed = new Date(t.completed_at!).getTime();
            return sum + (completed - placed) / (1000 * 60);
          }, 0) / completedTickets.length
        : null;

      // Calculate queue depth (average active tickets)
      // This is a simplified calculation - for accurate queue depth, we'd need time-series data
      const queueDepth = totals.ticketsPlaced > 0
        ? (totals.ticketsPlaced - totals.ticketsCompleted - totals.ticketsCanceled) / 2
        : 0;

      // Calculate throughput
      const hoursDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      const daysDiff = hoursDiff / 24;
      const throughput = {
        ticketsPerHour: hoursDiff > 0 ? totals.ticketsCompleted / hoursDiff : 0,
        ticketsPerDay: daysDiff > 0 ? totals.ticketsCompleted / daysDiff : 0
      };

      const result: KdsSummary = {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        totals,
        averages: {
          prepTimeMinutes,
          totalTimeMinutes,
          queueDepth
        },
        throughput
      };

      logQueryPerformance('getKdsSummary', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getKdsSummary', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets KDS throughput time series
   */
  async getKdsThroughput(
    locationId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timezone: string
  ): Promise<KdsThroughputPoint[]> {
    const startTime = Date.now();
    try {
      // For v1, we'll fetch all tickets and group in JavaScript
      // TODO: Optimize with RPC function for large date ranges
      const { data: tickets, error } = await this.client
        .from('kitchen_tickets')
        .select('placed_at, ready_at')
        .eq('location_id', locationId)
        .gte('placed_at', startDate.toISOString())
        .lte('placed_at', endDate.toISOString())
        .not('completed_at', 'is', null);

      if (error) throw error;

      const ticketsData = tickets || [];
      const buckets = new Map<string, { count: number; prepTimes: number[] }>();

      // Group tickets by time bucket
      ticketsData.forEach(ticket => {
        const placedDate = new Date(ticket.placed_at);
        let bucketKey: string;
        
        if (granularity === 'hour') {
          bucketKey = placedDate.toISOString().slice(0, 13) + ':00:00.000Z';
        } else if (granularity === 'day') {
          bucketKey = placedDate.toISOString().slice(0, 10) + 'T00:00:00.000Z';
        } else { // week
          const weekStart = new Date(placedDate);
          weekStart.setDate(placedDate.getDate() - placedDate.getDay());
          weekStart.setHours(0, 0, 0, 0);
          bucketKey = weekStart.toISOString();
        }

        if (!buckets.has(bucketKey)) {
          buckets.set(bucketKey, { count: 0, prepTimes: [] });
        }
        
        const bucket = buckets.get(bucketKey)!;
        bucket.count++;
        
        if (ticket.ready_at) {
          const placed = new Date(ticket.placed_at).getTime();
          const ready = new Date(ticket.ready_at).getTime();
          const prepTime = (ready - placed) / (1000 * 60);
          bucket.prepTimes.push(prepTime);
        }
      });

      // Convert to result array
      const result: KdsThroughputPoint[] = Array.from(buckets.entries())
        .map(([timestamp, data]) => ({
          timestamp,
          count: data.count,
          avgPrepTime: data.prepTimes.length > 0
            ? data.prepTimes.reduce((sum, t) => sum + t, 0) / data.prepTimes.length
            : null
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      logQueryPerformance('getKdsThroughput', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getKdsThroughput', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets prep time time series
   */
  async getKdsPrepTimeSeries(
    locationId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timezone: string
  ): Promise<KdsPrepTimePoint[]> {
    const startTime = Date.now();
    try {
      // Fetch tickets with prep times
      const { data: tickets, error } = await this.client
        .from('kitchen_tickets')
        .select('placed_at, ready_at')
        .eq('location_id', locationId)
        .gte('placed_at', startDate.toISOString())
        .lte('placed_at', endDate.toISOString())
        .not('ready_at', 'is', null);

      if (error) throw error;

      const ticketsData = tickets || [];
      const buckets = new Map<string, number[]>();

      // Group prep times by time bucket
      ticketsData.forEach(ticket => {
        const placedDate = new Date(ticket.placed_at);
        let bucketKey: string;
        
        if (granularity === 'hour') {
          bucketKey = placedDate.toISOString().slice(0, 13) + ':00:00.000Z';
        } else if (granularity === 'day') {
          bucketKey = placedDate.toISOString().slice(0, 10) + 'T00:00:00.000Z';
        } else { // week
          const weekStart = new Date(placedDate);
          weekStart.setDate(placedDate.getDate() - placedDate.getDay());
          weekStart.setHours(0, 0, 0, 0);
          bucketKey = weekStart.toISOString();
        }

        if (!buckets.has(bucketKey)) {
          buckets.set(bucketKey, []);
        }
        
        const placed = new Date(ticket.placed_at).getTime();
        const ready = new Date(ticket.ready_at!).getTime();
        const prepTime = (ready - placed) / (1000 * 60);
        buckets.get(bucketKey)!.push(prepTime);
      });

      // Convert to result array
      const result: KdsPrepTimePoint[] = Array.from(buckets.entries())
        .map(([timestamp, prepTimes]) => ({
          timestamp,
          avgPrepTimeMinutes: prepTimes.length > 0
            ? prepTimes.reduce((sum, t) => sum + t, 0) / prepTimes.length
            : null,
          count: prepTimes.length
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      logQueryPerformance('getKdsPrepTimeSeries', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getKdsPrepTimeSeries', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets KDS heatmap data (day of week x hour)
   */
  async getKdsHeatmap(
    locationId: string,
    startDate: Date,
    endDate: Date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timezone: string
  ): Promise<KdsHeatmapCell[]> {
    const startTime = Date.now();
    try {
      // Fetch tickets
      const { data: tickets, error } = await this.client
        .from('kitchen_tickets')
        .select('placed_at, ready_at')
        .eq('location_id', locationId)
        .gte('placed_at', startDate.toISOString())
        .lte('placed_at', endDate.toISOString());

      if (error) throw error;

      const ticketsData = tickets || [];
      const cells = new Map<string, { count: number; prepTimes: number[] }>();

      // Group by day of week and hour
      ticketsData.forEach(ticket => {
        const placedDate = new Date(ticket.placed_at);
        const dayOfWeek = placedDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
        const hour = placedDate.getUTCHours();
        const cellKey = `${dayOfWeek}-${hour}`;

        if (!cells.has(cellKey)) {
          cells.set(cellKey, { count: 0, prepTimes: [] });
        }
        
        const cell = cells.get(cellKey)!;
        cell.count++;
        
        if (ticket.ready_at) {
          const placed = new Date(ticket.placed_at).getTime();
          const ready = new Date(ticket.ready_at).getTime();
          const prepTime = (ready - placed) / (1000 * 60);
          cell.prepTimes.push(prepTime);
        }
      });

      // Convert to result array
      const result: KdsHeatmapCell[] = Array.from(cells.entries())
        .map(([cellKey, data]) => {
          const [dayOfWeek, hour] = cellKey.split('-').map(Number);
          return {
            dayOfWeek,
            hour,
            count: data.count,
            avgPrepTimeMinutes: data.prepTimes.length > 0
              ? data.prepTimes.reduce((sum, t) => sum + t, 0) / data.prepTimes.length
              : null
          };
        });

      logQueryPerformance('getKdsHeatmap', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getKdsHeatmap', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets KDS metrics by source (online vs POS)
   */
  async getKdsBySource(
    locationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<KdsSourceMetrics> {
    const startTime = Date.now();
    try {
      // Fetch tickets grouped by source
      const { data: tickets, error } = await this.client
        .from('kitchen_tickets')
        .select('source, placed_at, ready_at, completed_at')
        .eq('location_id', locationId)
        .gte('placed_at', startDate.toISOString())
        .lte('placed_at', endDate.toISOString());

      if (error) throw error;

      const ticketsData = tickets || [];
      
      const countrtopTickets = ticketsData.filter(t => t.source === 'countrtop_online');
      const squarePosTickets = ticketsData.filter(t => t.source === 'square_pos');

      const calculateAvgPrepTime = (tickets: typeof ticketsData): number | null => {
        const ready = tickets.filter(t => t.ready_at && t.placed_at);
        if (ready.length === 0) return null;
        const total = ready.reduce((sum, t) => {
          const placed = new Date(t.placed_at).getTime();
          const readyTime = new Date(t.ready_at!).getTime();
          return sum + (readyTime - placed) / (1000 * 60);
        }, 0);
        return total / ready.length;
      };

      const calculateAvgTotalTime = (tickets: typeof ticketsData): number | null => {
        const completed = tickets.filter(t => t.completed_at && t.placed_at);
        if (completed.length === 0) return null;
        const total = completed.reduce((sum, t) => {
          const placed = new Date(t.placed_at).getTime();
          const completedTime = new Date(t.completed_at!).getTime();
          return sum + (completedTime - placed) / (1000 * 60);
        }, 0);
        return total / completed.length;
      };

      const result: KdsSourceMetrics = {
        countrtop_online: {
          count: countrtopTickets.length,
          avgPrepTimeMinutes: calculateAvgPrepTime(countrtopTickets),
          avgTotalTimeMinutes: calculateAvgTotalTime(countrtopTickets)
        },
        square_pos: {
          count: squarePosTickets.length,
          avgPrepTimeMinutes: calculateAvgPrepTime(squarePosTickets),
          avgTotalTimeMinutes: calculateAvgTotalTime(squarePosTickets)
        }
      };

      logQueryPerformance('getKdsBySource', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getKdsBySource', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets revenue time series data
   * Extracts revenue from square_orders.raw JSONB field
   */
  async getRevenueSeries(
    locationId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week' | 'month',
    timezone: string
  ): Promise<RevenuePoint[]> {
    const startTime = Date.now();
    try {
      // Fetch orders with raw data
      const { data: orders, error } = await this.client
        .from('square_orders')
        .select('created_at, source, raw')
        .eq('location_id', locationId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (error) throw error;

      const ordersData = orders || [];
      const buckets = new Map<string, { revenue: number; orderCount: number }>();

      // Extract revenue from raw JSONB and group by time bucket
      ordersData.forEach(order => {
        const createdDate = new Date(order.created_at);
        
        // Convert to vendor timezone
        const tzDate = new Date(createdDate.toLocaleString('en-US', { timeZone: timezone }));
        
        let bucketKey: string;
        if (granularity === 'hour') {
          bucketKey = new Date(tzDate.setMinutes(0, 0, 0)).toISOString();
        } else if (granularity === 'day') {
          bucketKey = new Date(tzDate.setHours(0, 0, 0, 0)).toISOString();
        } else if (granularity === 'week') {
          const weekStart = new Date(tzDate);
          weekStart.setDate(tzDate.getDate() - tzDate.getDay());
          weekStart.setHours(0, 0, 0, 0);
          bucketKey = weekStart.toISOString();
        } else { // month
          const monthStart = new Date(tzDate.getFullYear(), tzDate.getMonth(), 1);
          bucketKey = monthStart.toISOString();
        }

        if (!buckets.has(bucketKey)) {
          buckets.set(bucketKey, { revenue: 0, orderCount: 0 });
        }

        const bucket = buckets.get(bucketKey)!;
        bucket.orderCount++;

        // Extract revenue from raw JSONB
        // Square API structure: raw.net_amounts.total_money.amount (cents)
        const raw = order.raw as Record<string, unknown> | null;
        if (raw && typeof raw === 'object') {
          const netAmounts = raw.net_amounts as Record<string, unknown> | undefined;
          if (netAmounts && typeof netAmounts === 'object') {
            const totalMoney = netAmounts.total_money as Record<string, unknown> | undefined;
            if (totalMoney && typeof totalMoney === 'object') {
              const amount = totalMoney.amount;
              if (typeof amount === 'number') {
                bucket.revenue += amount / 100.0; // Convert cents to dollars
              } else if (typeof amount === 'string') {
                bucket.revenue += parseFloat(amount) / 100.0;
              }
            }
          }
        }
      });

      // Convert to result array
      const result: RevenuePoint[] = Array.from(buckets.entries())
        .map(([timestamp, data]) => ({
          timestamp,
          revenue: data.revenue,
          orderCount: data.orderCount,
          averageOrderValue: data.orderCount > 0 ? data.revenue / data.orderCount : 0
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      logQueryPerformance('getRevenueSeries', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getRevenueSeries', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets revenue breakdown by source (online vs POS)
   */
  async getRevenueBySource(
    locationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RevenueBySource> {
    const startTime = Date.now();
    try {
      // Fetch orders with raw data
      const { data: orders, error } = await this.client
        .from('square_orders')
        .select('source, raw')
        .eq('location_id', locationId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (error) throw error;

      const ordersData = orders || [];
      const countrtopOrders: typeof ordersData = [];
      const squarePosOrders: typeof ordersData = [];

      ordersData.forEach(order => {
        if (order.source === 'countrtop_online') {
          countrtopOrders.push(order);
        } else {
          squarePosOrders.push(order);
        }
      });

      const extractRevenue = (orders: typeof ordersData): number => {
        return orders.reduce((sum, order) => {
          const raw = order.raw as Record<string, unknown> | null;
          if (raw && typeof raw === 'object') {
            const netAmounts = raw.net_amounts as Record<string, unknown> | undefined;
            if (netAmounts && typeof netAmounts === 'object') {
              const totalMoney = netAmounts.total_money as Record<string, unknown> | undefined;
              if (totalMoney && typeof totalMoney === 'object') {
                const amount = totalMoney.amount;
                if (typeof amount === 'number') {
                  return sum + amount / 100.0;
                } else if (typeof amount === 'string') {
                  return sum + parseFloat(amount) / 100.0;
                }
              }
            }
          }
          return sum;
        }, 0);
      };

      const countrtopRevenue = extractRevenue(countrtopOrders);
      const squarePosRevenue = extractRevenue(squarePosOrders);
      const totalRevenue = countrtopRevenue + squarePosRevenue;
      const totalOrderCount = ordersData.length;

      const result: RevenueBySource = {
        countrtop_online: {
          revenue: countrtopRevenue,
          orderCount: countrtopOrders.length,
          averageOrderValue: countrtopOrders.length > 0 ? countrtopRevenue / countrtopOrders.length : 0
        },
        square_pos: {
          revenue: squarePosRevenue,
          orderCount: squarePosOrders.length,
          averageOrderValue: squarePosOrders.length > 0 ? squarePosRevenue / squarePosOrders.length : 0
        },
        total: {
          revenue: totalRevenue,
          orderCount: totalOrderCount,
          averageOrderValue: totalOrderCount > 0 ? totalRevenue / totalOrderCount : 0
        }
      };

      logQueryPerformance('getRevenueBySource', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getRevenueBySource', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets Average Order Value (AOV) time series
   */
  async getAovSeries(
    locationId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week' | 'month',
    timezone: string
  ): Promise<AovPoint[]> {
    const startTime = Date.now();
    try {
      // Use getRevenueSeries and transform to AOV points
      const revenuePoints = await this.getRevenueSeries(locationId, startDate, endDate, granularity, timezone);
      
      const result: AovPoint[] = revenuePoints.map(point => ({
        timestamp: point.timestamp,
        averageOrderValue: point.averageOrderValue,
        orderCount: point.orderCount
      }));

      logQueryPerformance('getAovSeries', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getAovSeries', startTime, false, error);
      throw error;
    }
  }

  // ============================================================================
  // Customer Analytics (Milestone 10B - CountrTop Online Only)
  // ============================================================================

  /**
   * Gets customer summary metrics (CountrTop online orders only)
   */
  async getCustomerSummary(
    vendorId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CustomerSummary> {
    const startTime = Date.now();
    try {
      // Fetch all order snapshots with user_id (CountrTop online orders only)
      const { data: ordersData, error } = await this.client
        .from('order_snapshots')
        .select('id,user_id,placed_at,snapshot_json')
        .eq('vendor_id', vendorId)
        .not('user_id', 'is', null)
        .gte('placed_at', startDate.toISOString())
        .lte('placed_at', endDate.toISOString());

      if (error) throw error;

      const orders = (ordersData ?? []).filter((o) => o.user_id);

      // Calculate customer metrics
      const customerOrderCounts = new Map<string, number>();
      const customerRevenue = new Map<string, number>();
      const customerFirstOrder = new Map<string, string>();
      const customerLastOrder = new Map<string, string>();

      // Use helper function for revenue extraction
      const { extractRevenueFromSnapshot } = await import('./revenueAnalytics');
      const extractRevenue = (snapshot: Record<string, unknown> | null): number => {
        return extractRevenueFromSnapshot(snapshot);
      };

      orders.forEach((order) => {
        const userId = order.user_id;
        if (!userId) return;

        customerOrderCounts.set(userId, (customerOrderCounts.get(userId) ?? 0) + 1);
        
        const revenue = extractRevenue(order.snapshot_json as Record<string, unknown> | null);
        customerRevenue.set(userId, (customerRevenue.get(userId) ?? 0) + revenue);

        const placedAt = order.placed_at;
        if (!customerFirstOrder.has(userId) || placedAt < customerFirstOrder.get(userId)!) {
          customerFirstOrder.set(userId, placedAt);
        }
        if (!customerLastOrder.has(userId) || placedAt > customerLastOrder.get(userId)!) {
          customerLastOrder.set(userId, placedAt);
        }
      });

      const totalCustomers = customerOrderCounts.size;
      const repeatCustomers = [...customerOrderCounts.values()].filter((count) => count > 1).length;
      const totalOrders = orders.length;
      const totalRevenue = [...customerRevenue.values()].reduce((sum, rev) => sum + rev, 0);

      // Calculate new vs returning customers in period
      const firstOrderDates = new Map<string, string>();
      orders.forEach((order) => {
        const userId = order.user_id;
        if (!userId) return;
        const placedAt = order.placed_at;
        if (!firstOrderDates.has(userId) || placedAt < firstOrderDates.get(userId)!) {
          firstOrderDates.set(userId, placedAt);
        }
      });

      const newCustomers = [...firstOrderDates.values()].filter(
        (firstOrderDate) => new Date(firstOrderDate) >= startDate && new Date(firstOrderDate) <= endDate
      ).length;
      const returningCustomers = totalCustomers - newCustomers;

      const result: CustomerSummary = {
        totalCustomers,
        repeatCustomers,
        repeatCustomerRate: totalCustomers > 0 ? repeatCustomers / totalCustomers : 0,
        averageOrdersPerCustomer: totalCustomers > 0 ? totalOrders / totalCustomers : 0,
        averageLifetimeValue: totalCustomers > 0 ? totalRevenue / totalCustomers : 0,
        newCustomers,
        returningCustomers
      };

      logQueryPerformance('getCustomerSummary', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getCustomerSummary', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets customer lifetime value data (all time, CountrTop online orders only)
   */
  async getCustomerLtv(vendorId: string): Promise<CustomerLtvPoint[]> {
    const startTime = Date.now();
    try {
      // Fetch all order snapshots with user_id (CountrTop online orders only)
      const { data: ordersData, error } = await this.client
        .from('order_snapshots')
        .select('id,user_id,placed_at,snapshot_json')
        .eq('vendor_id', vendorId)
        .not('user_id', 'is', null);

      if (error) throw error;

      const orders = (ordersData ?? []).filter((o) => o.user_id);

      // Use helper function for revenue extraction
      const { extractRevenueFromSnapshot } = await import('./revenueAnalytics');
      const extractRevenue = (snapshot: Record<string, unknown> | null): number => {
        return extractRevenueFromSnapshot(snapshot);
      };

      // Aggregate by user
      const userData = new Map<string, {
        orderCount: number;
        totalRevenue: number;
        firstOrderDate: string;
        lastOrderDate: string;
      }>();

      orders.forEach((order) => {
        const userId = order.user_id;
        if (!userId) return;

        const existing = userData.get(userId) || {
          orderCount: 0,
          totalRevenue: 0,
          firstOrderDate: order.placed_at,
          lastOrderDate: order.placed_at
        };

        existing.orderCount += 1;
        existing.totalRevenue += extractRevenue(order.snapshot_json as Record<string, unknown> | null);

        if (order.placed_at < existing.firstOrderDate) {
          existing.firstOrderDate = order.placed_at;
        }
        if (order.placed_at > existing.lastOrderDate) {
          existing.lastOrderDate = order.placed_at;
        }

        userData.set(userId, existing);
      });

      // Transform to CustomerLtvPoint[]
      const result: CustomerLtvPoint[] = [...userData.entries()].map(([userId, data]) => ({
        userId,
        orderCount: data.orderCount,
        totalRevenue: data.totalRevenue,
        firstOrderDate: data.firstOrderDate,
        lastOrderDate: data.lastOrderDate,
        averageOrderValue: data.orderCount > 0 ? data.totalRevenue / data.orderCount : 0
      })).sort((a, b) => b.totalRevenue - a.totalRevenue); // Sort by revenue descending

      logQueryPerformance('getCustomerLtv', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getCustomerLtv', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets repeat customer metrics (CountrTop online orders only)
   */
  async getRepeatCustomerMetrics(
    vendorId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RepeatCustomerMetrics> {
    const startTime = Date.now();
    try {
      // Fetch all order snapshots with user_id (CountrTop online orders only)
      const { data: ordersData, error } = await this.client
        .from('order_snapshots')
        .select('id,user_id')
        .eq('vendor_id', vendorId)
        .not('user_id', 'is', null)
        .gte('placed_at', startDate.toISOString())
        .lte('placed_at', endDate.toISOString());

      if (error) throw error;

      const orders = (ordersData ?? []).filter((o) => o.user_id);

      // Count orders per customer
      const customerOrderCounts = new Map<string, number>();
      orders.forEach((order) => {
        const userId = order.user_id;
        if (!userId) return;
        customerOrderCounts.set(userId, (customerOrderCounts.get(userId) ?? 0) + 1);
      });

      const totalCustomers = customerOrderCounts.size;
      const repeatCustomers = [...customerOrderCounts.values()].filter((count) => count > 1).length;
      const singleOrderCustomers = totalCustomers - repeatCustomers;

      const result: RepeatCustomerMetrics = {
        repeatCustomerRate: totalCustomers > 0 ? repeatCustomers / totalCustomers : 0,
        totalCustomers,
        repeatCustomers,
        singleOrderCustomers
      };

      logQueryPerformance('getRepeatCustomerMetrics', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getRepeatCustomerMetrics', startTime, false, error);
      throw error;
    }
  }

  // ============================================================================
  // Item Performance (Milestone 10B)
  // ============================================================================

  /**
   * Gets item performance metrics (CountrTop online orders only)
   */
  async getItemPerformance(
    vendorId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ItemPerformance[]> {
    const startTime = Date.now();
    try {
      // Fetch all order snapshots with user_id (CountrTop online orders only)
      const { data: ordersData, error } = await this.client
        .from('order_snapshots')
        .select('id,user_id,placed_at,snapshot_json')
        .eq('vendor_id', vendorId)
        .not('user_id', 'is', null)
        .gte('placed_at', startDate.toISOString())
        .lte('placed_at', endDate.toISOString());

      if (error) throw error;

      const orders = (ordersData ?? []).filter((o) => o.user_id);

      // Aggregate item data
      const itemData = new Map<string, {
        quantity: number;
        revenue: number;
        orderCount: Set<string>; // Track unique orders containing this item
      }>();

      type SnapshotItem = {
        name?: unknown;
        quantity?: unknown;
        price?: unknown;
        amount?: unknown;
      };

      orders.forEach((order) => {
        const snapshot = order.snapshot_json as { items?: unknown[] } | null;
        const items = Array.isArray(snapshot?.items) ? snapshot.items : [];

        items.forEach((item) => {
          const raw = item as SnapshotItem;
          const itemName = typeof raw.name === 'string' ? raw.name : 'Unknown Item';
          const quantity = typeof raw.quantity === 'number' ? raw.quantity : 1;
          // Price/amount is stored in cents, convert to dollars
          const priceInCents = typeof raw.price === 'number' ? raw.price : (typeof raw.amount === 'number' ? raw.amount : 0);
          const price = priceInCents / 100;

          const existing = itemData.get(itemName) || {
            quantity: 0,
            revenue: 0,
            orderCount: new Set<string>()
          };

          existing.quantity += quantity;
          existing.revenue += price * quantity;
          existing.orderCount.add(order.id);

          itemData.set(itemName, existing);
        });
      });

      // Transform to ItemPerformance[] (avgPrepTimeMinutes will be null for now)
      const result: ItemPerformance[] = [...itemData.entries()].map(([itemName, data]) => ({
        itemName,
        quantity: data.quantity,
        revenue: data.revenue,
        orderCount: data.orderCount.size,
        avgPrice: data.quantity > 0 ? data.revenue / data.quantity : 0,
        avgPrepTimeMinutes: null // TODO: Correlate with kitchen_tickets if needed
      })).sort((a, b) => b.revenue - a.revenue); // Sort by revenue descending

      logQueryPerformance('getItemPerformance', startTime, true);
      return result;
    } catch (error) {
      logQueryPerformance('getItemPerformance', startTime, false, error);
      throw error;
    }
  }

  // ============================================================================
  // Feature Flags (Milestone H)
  // ============================================================================

  /**
   * Gets a single feature flag for a vendor
   */
  async getVendorFeatureFlag(vendorId: string, featureKey: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('vendor_feature_flags')
        .select('enabled')
        .eq('vendor_id', vendorId)
        .eq('feature_key', featureKey)
        .maybeSingle();

      if (error) throw error;
      
      logQueryPerformance('getVendorFeatureFlag', startTime, true);
      return data?.enabled ?? false; // Default to false
    } catch (error) {
      logQueryPerformance('getVendorFeatureFlag', startTime, false, error);
      throw error;
    }
  }

  /**
   * Sets a feature flag for a vendor
   */
  async setVendorFeatureFlag(vendorId: string, featureKey: string, enabled: boolean): Promise<void> {
    const startTime = Date.now();
    try {
      const { error } = await this.client
        .from('vendor_feature_flags')
        .upsert({
          vendor_id: vendorId,
          feature_key: featureKey,
          enabled,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'vendor_id,feature_key'
        });

      if (error) throw error;
      
      logQueryPerformance('setVendorFeatureFlag', startTime, true);
    } catch (error) {
      logQueryPerformance('setVendorFeatureFlag', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets all feature flags for a vendor
   */
  async getVendorFeatureFlags(vendorId: string): Promise<Record<string, boolean>> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('vendor_feature_flags')
        .select('feature_key, enabled')
        .eq('vendor_id', vendorId);

      if (error) throw error;

      const flags: Record<string, boolean> = {};
      (data || []).forEach(flag => {
        flags[flag.feature_key] = flag.enabled;
      });

      logQueryPerformance('getVendorFeatureFlags', startTime, true);
      return flags;
    } catch (error) {
      logQueryPerformance('getVendorFeatureFlags', startTime, false, error);
      throw error;
    }
  }

  /**
   * Gets all location PINs for a vendor (returns locationId -> hasPin mapping)
   */
  async getLocationPins(vendorId: string): Promise<Record<string, boolean>> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('vendor_location_pins')
        .select('location_id')
        .eq('vendor_id', vendorId);

      if (error) throw error;

      const pins: Record<string, boolean> = {};
      (data || []).forEach(pin => {
        pins[pin.location_id] = true;
      });

      logQueryPerformance('getLocationPins', startTime, true);
      return pins;
    } catch (error) {
      logQueryPerformance('getLocationPins', startTime, false, error);
      throw error;
    }
  }

  /**
   * Sets or updates a location PIN for a vendor
   * PIN is hashed using SHA-256 before storage
   */
  async setLocationPin(vendorId: string, locationId: string, pin: string): Promise<void> {
    const startTime = Date.now();
    try {
      // Validate PIN format (4 digits)
      if (!/^\d{4}$/.test(pin)) {
        throw new Error('PIN must be exactly 4 digits');
      }

      // Hash PIN using SHA-256 (same as in KDS auth endpoint)
      const pinHash = createHash('sha256').update(pin).digest('hex');

      const { error } = await this.client
        .from('vendor_location_pins')
        .upsert({
          vendor_id: vendorId,
          location_id: locationId,
          pin_hash: pinHash,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'vendor_id,location_id'
        });

      if (error) throw error;
      
      logQueryPerformance('setLocationPin', startTime, true);
    } catch (error) {
      logQueryPerformance('setLocationPin', startTime, false, error);
      throw error;
    }
  }

  // ============================================================================
  // KDS Pairing Tokens
  // ============================================================================

  async createPairingToken(
    vendorId: string,
    locationId: string | null = null,
    expiresInMinutes = 60
  ): Promise<{ token: string; tokenId: string; createdAt: string; expiresAt: string; locationId?: string | null }> {
    const startTime = Date.now();
    try {
      const token = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

      const { data, error } = await this.client
        .from('kds_pairing_tokens')
        .insert({
          vendor_id: vendorId,
          location_id: locationId,
          token_hash: tokenHash,
          expires_at: expiresAt,
          created_at: new Date().toISOString()
        })
        .select('id, created_at')
        .single();

      if (error) throw error;
      logQueryPerformance('createPairingToken', startTime, true);
      return {
        token,
        tokenId: data.id,
        createdAt: data.created_at,
        expiresAt,
        locationId
      };
    } catch (error) {
      logQueryPerformance('createPairingToken', startTime, false, error);
      throw error;
    }
  }

  async listPairingTokens(vendorId: string): Promise<PairingToken[]> {
    const startTime = Date.now();
    try {
      const now = new Date().toISOString();
      const { data, error } = await this.client
        .from('kds_pairing_tokens')
        .select('*')
        .eq('vendor_id', vendorId)
        .is('used_at', null)
        .gt('expires_at', now)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const tokens = ((data || []) as Database['public']['Tables']['kds_pairing_tokens']['Row'][]).map((row) => ({
        id: row.id,
        vendorId: row.vendor_id,
        locationId: row.location_id,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        usedAt: row.used_at,
        createdAt: row.created_at
      }));

      logQueryPerformance('listPairingTokens', startTime, true);
      return tokens;
    } catch (error) {
      logQueryPerformance('listPairingTokens', startTime, false, error);
      throw error;
    }
  }

  async consumePairingToken(token: string): Promise<{ vendorId: string; locationId?: string | null } | null> {
    const startTime = Date.now();
    try {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const now = new Date().toISOString();
      const { data, error } = await this.client
        .from('kds_pairing_tokens')
        .update({ used_at: now })
        .eq('token_hash', tokenHash)
        .is('used_at', null)
        .gt('expires_at', now)
        .select('vendor_id, location_id')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return null;
      }

      logQueryPerformance('consumePairingToken', startTime, true);
      return { vendorId: data.vendor_id, locationId: data.location_id };
    } catch (error) {
      logQueryPerformance('consumePairingToken', startTime, false, error);
      throw error;
    }
  }

  // ============================================================================
  // Employees & Time Tracking
  // ============================================================================

  async listEmployees(vendorId: string): Promise<import('@countrtop/models').Employee[]> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('employees')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('name', { ascending: true });

      if (error) throw error;

      const employees = ((data || []) as Database['public']['Tables']['employees']['Row'][]).map((row) => ({
        id: row.id,
        vendorId: row.vendor_id,
        name: row.name,
        pin: row.pin,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      logQueryPerformance('listEmployees', startTime, true);
      return employees;
    } catch (error) {
      logQueryPerformance('listEmployees', startTime, false, error);
      throw error;
    }
  }

  async createEmployee(vendorId: string, name: string, pin: string): Promise<import('@countrtop/models').Employee> {
    const startTime = Date.now();
    try {
      // Validate PIN format (3 digits)
      if (!/^\d{3}$/.test(pin)) {
        throw new Error('PIN must be exactly 3 digits');
      }

      const { data, error } = await this.client
        .from('employees')
        .insert({
          vendor_id: vendorId,
          name,
          pin,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      const employeeRow = data as Database['public']['Tables']['employees']['Row'];
      const employee = {
        id: employeeRow.id,
        vendorId: employeeRow.vendor_id,
        name: employeeRow.name,
        pin: employeeRow.pin,
        isActive: employeeRow.is_active,
        createdAt: employeeRow.created_at,
        updatedAt: employeeRow.updated_at
      };

      logQueryPerformance('createEmployee', startTime, true);
      return employee;
    } catch (error) {
      logQueryPerformance('createEmployee', startTime, false, error);
      throw error;
    }
  }

  async updateEmployee(employeeId: string, updates: { name?: string; pin?: string; isActive?: boolean }): Promise<import('@countrtop/models').Employee> {
    const startTime = Date.now();
    try {
      if (updates.pin && !/^\d{3}$/.test(updates.pin)) {
        throw new Error('PIN must be exactly 3 digits');
      }

      const updateData: Partial<Database['public']['Tables']['employees']['Update']> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.pin !== undefined) updateData.pin = updates.pin;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await this.client
        .from('employees')
        .update(updateData)
        .eq('id', employeeId)
        .select()
        .single();

      if (error) throw error;

      const employeeRow = data as Database['public']['Tables']['employees']['Row'];
      const employee = {
        id: employeeRow.id,
        vendorId: employeeRow.vendor_id,
        name: employeeRow.name,
        pin: employeeRow.pin,
        isActive: employeeRow.is_active,
        createdAt: employeeRow.created_at,
        updatedAt: employeeRow.updated_at
      };

      logQueryPerformance('updateEmployee', startTime, true);
      return employee;
    } catch (error) {
      logQueryPerformance('updateEmployee', startTime, false, error);
      throw error;
    }
  }

  async deleteEmployee(employeeId: string): Promise<void> {
    const startTime = Date.now();
    try {
      const { error } = await this.client
        .from('employees')
        .delete()
        .eq('id', employeeId);

      if (error) throw error;
      logQueryPerformance('deleteEmployee', startTime, true);
    } catch (error) {
      logQueryPerformance('deleteEmployee', startTime, false, error);
      throw error;
    }
  }

  async getEmployeeByPin(vendorId: string, pin: string): Promise<import('@countrtop/models').Employee | null> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('employees')
        .select('*')
        .eq('vendor_id', vendorId)
        .eq('pin', pin)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        logQueryPerformance('getEmployeeByPin', startTime, true);
        return null;
      }

      const employeeRow = data as Database['public']['Tables']['employees']['Row'];
      const employee = {
        id: employeeRow.id,
        vendorId: employeeRow.vendor_id,
        name: employeeRow.name,
        pin: employeeRow.pin,
        isActive: employeeRow.is_active,
        createdAt: employeeRow.created_at,
        updatedAt: employeeRow.updated_at
      };

      logQueryPerformance('getEmployeeByPin', startTime, true);
      return employee;
    } catch (error) {
      logQueryPerformance('getEmployeeByPin', startTime, false, error);
      throw error;
    }
  }

  async clockIn(vendorId: string, employeeId: string, locationId: string | null): Promise<import('@countrtop/models').TimeEntry> {
    const startTime = Date.now();
    try {
      // Check if employee already has an active time entry
      const activeEntry = await this.getActiveTimeEntry(vendorId, employeeId);
      if (activeEntry) {
        throw new Error('Employee already has an active time entry. Please clock out first.');
      }

      const { data, error } = await this.client
        .from('time_entries')
        .insert({
          vendor_id: vendorId,
          employee_id: employeeId,
          clock_in_at: new Date().toISOString(),
          location_id: locationId
        })
        .select()
        .single();

      if (error) throw error;

      const timeEntryRow = data as Database['public']['Tables']['time_entries']['Row'];
      const timeEntry = {
        id: timeEntryRow.id,
        vendorId: timeEntryRow.vendor_id,
        employeeId: timeEntryRow.employee_id,
        clockInAt: timeEntryRow.clock_in_at,
        clockOutAt: timeEntryRow.clock_out_at,
        locationId: timeEntryRow.location_id,
        notes: timeEntryRow.notes,
        createdAt: timeEntryRow.created_at,
        updatedAt: timeEntryRow.updated_at
      };

      logQueryPerformance('clockIn', startTime, true);
      return timeEntry;
    } catch (error) {
      logQueryPerformance('clockIn', startTime, false, error);
      throw error;
    }
  }

  async clockOut(vendorId: string, employeeId: string): Promise<import('@countrtop/models').TimeEntry> {
    const startTime = Date.now();
    try {
      // Find active time entry
      const activeEntry = await this.getActiveTimeEntry(vendorId, employeeId);
      if (!activeEntry) {
        throw new Error('No active time entry found. Please clock in first.');
      }

      const { data, error } = await this.client
        .from('time_entries')
        .update({
          clock_out_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', activeEntry.id)
        .select()
        .single();

      if (error) throw error;

      const timeEntryRow = data as Database['public']['Tables']['time_entries']['Row'];
      const timeEntry = {
        id: timeEntryRow.id,
        vendorId: timeEntryRow.vendor_id,
        employeeId: timeEntryRow.employee_id,
        clockInAt: timeEntryRow.clock_in_at,
        clockOutAt: timeEntryRow.clock_out_at,
        locationId: timeEntryRow.location_id,
        notes: timeEntryRow.notes,
        createdAt: timeEntryRow.created_at,
        updatedAt: timeEntryRow.updated_at
      };

      logQueryPerformance('clockOut', startTime, true);
      return timeEntry;
    } catch (error) {
      logQueryPerformance('clockOut', startTime, false, error);
      throw error;
    }
  }

  async getActiveTimeEntry(vendorId: string, employeeId: string): Promise<import('@countrtop/models').TimeEntry | null> {
    const startTime = Date.now();
    try {
      const { data, error } = await this.client
        .from('time_entries')
        .select('*')
        .eq('vendor_id', vendorId)
        .eq('employee_id', employeeId)
        .is('clock_out_at', null)
        .order('clock_in_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        logQueryPerformance('getActiveTimeEntry', startTime, true);
        return null;
      }

      const timeEntryRow = data as Database['public']['Tables']['time_entries']['Row'];
      const timeEntry = {
        id: timeEntryRow.id,
        vendorId: timeEntryRow.vendor_id,
        employeeId: timeEntryRow.employee_id,
        clockInAt: timeEntryRow.clock_in_at,
        clockOutAt: timeEntryRow.clock_out_at,
        locationId: timeEntryRow.location_id,
        notes: timeEntryRow.notes,
        createdAt: timeEntryRow.created_at,
        updatedAt: timeEntryRow.updated_at
      };

      logQueryPerformance('getActiveTimeEntry', startTime, true);
      return timeEntry;
    } catch (error) {
      logQueryPerformance('getActiveTimeEntry', startTime, false, error);
      throw error;
    }
  }

  async listTimeEntries(vendorId: string, employeeId: string | null, startDate: Date, endDate: Date): Promise<import('@countrtop/models').TimeEntry[]> {
    const startTime = Date.now();
    try {
      let query = this.client
        .from('time_entries')
        .select('*')
        .eq('vendor_id', vendorId)
        .gte('clock_in_at', startDate.toISOString())
        .lte('clock_in_at', endDate.toISOString())
        .order('clock_in_at', { ascending: false });

      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const timeEntries = ((data || []) as Database['public']['Tables']['time_entries']['Row'][]).map((row) => ({
        id: row.id,
        vendorId: row.vendor_id,
        employeeId: row.employee_id,
        clockInAt: row.clock_in_at,
        clockOutAt: row.clock_out_at,
        locationId: row.location_id,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      logQueryPerformance('listTimeEntries', startTime, true);
      return timeEntries;
    } catch (error) {
      logQueryPerformance('listTimeEntries', startTime, false, error);
      throw error;
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
  pickupInstructions: row.pickup_instructions ?? undefined,
  kdsActiveLimitTotal: row.kds_active_limit_total ?? undefined,
  kdsActiveLimitCt: row.kds_active_limit_ct ?? undefined,
  // Theming fields
  logoUrl: row.logo_url ?? undefined,
  primaryColor: row.primary_color ?? undefined,
  accentColor: row.accent_color ?? undefined,
  fontFamily: row.font_family ?? undefined,
  reviewUrl: row.review_url ?? undefined,
});

const mapVendorLocationFromRow = (row: Database['public']['Tables']['vendor_locations']['Row']): VendorLocation => ({
  id: row.id,
  vendorId: row.vendor_id,
  // POS-agnostic fields
  externalLocationId: row.square_location_id, // Use square_location_id for now (will rename column later)
  squareLocationId: row.square_location_id, // Deprecated alias
  posProvider: (row.pos_provider ?? 'square') as 'square' | 'toast' | 'clover',
  name: row.name,
  isPrimary: row.is_primary,
  isActive: row.is_active,
  addressLine1: row.address_line1 ?? undefined,
  addressLine2: row.address_line2 ?? undefined,
  city: row.city ?? undefined,
  state: row.state ?? undefined,
  postalCode: row.postal_code ?? undefined,
  phone: row.phone ?? undefined,
  timezone: row.timezone ?? undefined,
  pickupInstructions: row.pickup_instructions ?? undefined,
  onlineOrderingEnabled: row.online_ordering_enabled,
  kdsActiveLimitTotal: row.kds_active_limit_total ?? undefined,
  kdsActiveLimitCt: row.kds_active_limit_ct ?? undefined,
  kdsAutoBumpMinutes: row.kds_auto_bump_minutes ?? undefined,
  kdsSoundAlertsEnabled: row.kds_sound_alerts_enabled,
  kdsDisplayMode: (row.kds_display_mode ?? 'grid') as 'grid' | 'list',
  onlineOrderingLeadTimeMinutes: row.online_ordering_lead_time_minutes,
  onlineOrderingHoursJson: row.online_ordering_hours_json ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapOrderSnapshotFromRow = (
  row: Database['public']['Tables']['order_snapshots']['Row']
): OrderSnapshot => ({
  id: row.id,
  vendorId: row.vendor_id,
  userId: row.user_id,
  // POS-agnostic fields
  externalOrderId: row.square_order_id, // Use square_order_id for now (will rename column later)
  squareOrderId: row.square_order_id, // Deprecated alias
  placedAt: row.placed_at,
  snapshotJson: row.snapshot_json,
  fulfillmentStatus: row.fulfillment_status ?? undefined,
  readyAt: row.ready_at ?? undefined,
  completedAt: row.completed_at ?? undefined,
  updatedAt: row.updated_at ?? undefined,
  customerDisplayName: row.customer_display_name ?? undefined,
  pickupLabel: row.pickup_label ?? undefined,
  customerFeedbackRating:
    row.customer_feedback_rating === 'thumbs_up' || row.customer_feedback_rating === 'thumbs_down'
      ? row.customer_feedback_rating
      : undefined,
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
  pickup_label: order.pickupLabel ?? null,
  customer_feedback_rating: order.customerFeedbackRating ?? null
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

// KDS Mapping Helpers
export const mapSquareOrderFromRow = (
  row: Database['public']['Tables']['square_orders']['Row']
): SquareOrder => ({
  // POS-agnostic fields
  externalOrderId: row.square_order_id, // Use square_order_id for now (will rename column later)
  squareOrderId: row.square_order_id, // Deprecated alias
  posProvider: (row.pos_provider ?? 'square') as 'square' | 'toast' | 'clover',
  locationId: row.location_id,
  state: row.state,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  referenceId: row.reference_id ?? undefined,
  metadata: row.metadata ?? undefined,
  lineItems: row.line_items ?? undefined,
  fulfillment: row.fulfillment ?? undefined,
  source: row.source,
  raw: row.raw ?? undefined
});

export const toSquareOrderUpsert = (
  order: Partial<SquareOrder> & { squareOrderId: string; locationId: string; state: string; source: 'countrtop_online' | 'square_pos' }
): Database['public']['Tables']['square_orders']['Insert'] => ({
  square_order_id: order.squareOrderId,
  location_id: order.locationId,
  state: order.state,
  created_at: order.createdAt ?? new Date().toISOString(),
  updated_at: order.updatedAt ?? new Date().toISOString(),
  reference_id: order.referenceId ?? null,
  metadata: order.metadata ?? null,
  line_items: order.lineItems ?? null,
  fulfillment: order.fulfillment ?? null,
  source: order.source,
  raw: order.raw ?? null
});

export const mapKitchenTicketFromRow = (
  row: Database['public']['Tables']['kitchen_tickets']['Row']
): KitchenTicket => ({
  id: row.id,
  // POS-agnostic fields
  externalOrderId: row.square_order_id, // Use square_order_id for now (will rename column later)
  squareOrderId: row.square_order_id, // Deprecated alias
  posProvider: (row.pos_provider ?? 'square') as 'square' | 'toast' | 'clover',
  locationId: row.location_id,
  ctReferenceId: row.ct_reference_id ?? undefined,
  customerUserId: row.customer_user_id ?? undefined,
  source: row.source,
  status: row.status,
  shortcode: row.shortcode ?? undefined,
  promotedAt: row.promoted_at ?? undefined,
  placedAt: row.placed_at,
  readyAt: row.ready_at ?? undefined,
  completedAt: row.completed_at ?? undefined,
  canceledAt: row.canceled_at ?? undefined,
  lastUpdatedByVendorUserId: row.last_updated_by_vendor_user_id ?? undefined,
  updatedAt: row.updated_at,
  // Hold/notes/reorder fields
  heldAt: row.held_at ?? undefined,
  heldReason: row.held_reason ?? undefined,
  staffNotes: row.staff_notes ?? undefined,
  customLabel: row.custom_label ?? undefined,
  priorityOrder: row.priority_order ?? 0
});

export const toKitchenTicketInsert = (
  ticket: Partial<KitchenTicket> & { squareOrderId: string; locationId: string; source: 'countrtop_online' | 'square_pos'; status: KitchenTicketStatus }
): Database['public']['Tables']['kitchen_tickets']['Insert'] => ({
  id: ticket.id,
  square_order_id: ticket.squareOrderId,
  location_id: ticket.locationId,
  ct_reference_id: ticket.ctReferenceId ?? null,
  customer_user_id: ticket.customerUserId ?? null,
  source: ticket.source,
  status: ticket.status,
  shortcode: ticket.shortcode ?? null,
  promoted_at: ticket.promotedAt ?? null,
  placed_at: ticket.placedAt ?? new Date().toISOString(),
  ready_at: ticket.readyAt ?? null,
  completed_at: ticket.completedAt ?? null,
  canceled_at: ticket.canceledAt ?? null,
  last_updated_by_vendor_user_id: ticket.lastUpdatedByVendorUserId ?? null,
  updated_at: ticket.updatedAt ?? new Date().toISOString()
});
