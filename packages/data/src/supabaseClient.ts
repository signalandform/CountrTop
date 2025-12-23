import { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';

import { DataClient, LoyaltyLedgerEntryInput, OrderSnapshotInput, PushDeviceInput } from './dataClient';
import { LoyaltyLedgerEntry, OrderSnapshot, PushDevice, User, Vendor } from './models';

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
          status: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          display_name: string;
          square_location_id: string;
          square_credential_ref?: string | null;
          status?: string | null;
        };
        Update: Partial<Database['public']['Tables']['vendors']['Insert']>;
      };
      order_snapshots: {
        Row: {
          id: string;
          vendor_id: string;
          user_id: string | null;
          square_order_id: string;
          placed_at: string;
          snapshot_json: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          user_id?: string | null;
          square_order_id: string;
          placed_at?: string;
          snapshot_json: Record<string, unknown>;
        };
        Update: Partial<Database['public']['Tables']['order_snapshots']['Insert']>;
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
      };
    };
    Views: never;
    Functions: never;
    Enums: never;
    CompositeTypes: never;
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
    return mapAuthUser(data.user ?? null);
  }

  async getVendorBySlug(slug: string): Promise<Vendor | null> {
    const { data, error } = await this.client.from('vendors').select('*').eq('slug', slug).maybeSingle();
    if (error) throw error;
    return data ? mapVendorFromRow(data) : null;
  }

  async getVendorById(vendorId: string): Promise<Vendor | null> {
    const { data, error } = await this.client.from('vendors').select('*').eq('id', vendorId).maybeSingle();
    if (error) throw error;
    return data ? mapVendorFromRow(data) : null;
  }

  async createOrderSnapshot(order: OrderSnapshotInput): Promise<OrderSnapshot> {
    const { data, error } = await this.client
      .from('order_snapshots')
      .insert(toOrderSnapshotInsert(order))
      .select()
      .single();
    if (error) throw error;
    return mapOrderSnapshotFromRow(data);
  }

  async getOrderSnapshot(orderId: string): Promise<OrderSnapshot | null> {
    const { data, error } = await this.client
      .from('order_snapshots')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapOrderSnapshotFromRow(data) : null;
  }

  async listOrderSnapshotsForUser(vendorId: string, userId: string): Promise<OrderSnapshot[]> {
    const { data, error } = await this.client
      .from('order_snapshots')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('user_id', userId)
      .order('placed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapOrderSnapshotFromRow);
  }

  async listOrderSnapshotsForVendor(vendorId: string): Promise<OrderSnapshot[]> {
    const { data, error } = await this.client
      .from('order_snapshots')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('placed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapOrderSnapshotFromRow);
  }

  async recordLoyaltyEntry(entry: LoyaltyLedgerEntryInput): Promise<LoyaltyLedgerEntry> {
    const { data, error } = await this.client
      .from('loyalty_ledger')
      .insert(toLoyaltyLedgerInsert(entry))
      .select()
      .single();
    if (error) throw error;
    return mapLoyaltyLedgerFromRow(data);
  }

  async listLoyaltyEntriesForUser(vendorId: string, userId: string): Promise<LoyaltyLedgerEntry[]> {
    const { data, error } = await this.client
      .from('loyalty_ledger')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapLoyaltyLedgerFromRow);
  }

  async getLoyaltyBalance(vendorId: string, userId: string): Promise<number> {
    const entries = await this.listLoyaltyEntriesForUser(vendorId, userId);
    return entries.reduce((sum, entry) => sum + entry.pointsDelta, 0);
  }

  async upsertPushDevice(device: PushDeviceInput): Promise<PushDevice> {
    const payload = toPushDeviceInsert(device);
    const { data, error } = await this.client
      .from('push_devices')
      .upsert(payload, { onConflict: 'user_id,device_token' })
      .select()
      .single();
    if (error) throw error;
    return mapPushDeviceFromRow(data);
  }

  async listPushDevicesForUser(userId: string): Promise<PushDevice[]> {
    const { data, error } = await this.client.from('push_devices').select('*').eq('user_id', userId);
    if (error) throw error;
    return (data ?? []).map(mapPushDeviceFromRow);
  }
}

const mapVendorFromRow = (row: Database['public']['Tables']['vendors']['Row']): Vendor => ({
  id: row.id,
  slug: row.slug,
  displayName: row.display_name,
  squareLocationId: row.square_location_id,
  squareCredentialRef: row.square_credential_ref ?? undefined,
  status: row.status ?? undefined
});

const mapOrderSnapshotFromRow = (
  row: Database['public']['Tables']['order_snapshots']['Row']
): OrderSnapshot => ({
  id: row.id,
  vendorId: row.vendor_id,
  userId: row.user_id,
  squareOrderId: row.square_order_id,
  placedAt: row.placed_at,
  snapshotJson: row.snapshot_json
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
  snapshot_json: order.snapshotJson
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

const mapAuthUser = (user: SupabaseAuthUser | null): User | null => {
  if (!user) return null;
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
