import { RealtimeChannel, SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';

import { CreateOrderInput, DataClient, MenuItemInput, Subscription } from './dataClient';
import {
  MenuItem,
  MenuItemOption,
  Order,
  OrderItem,
  OrderStatus,
  RewardActivity,
   RewardActivityInput,
  User,
  VendorSettings
} from './models';

export type Database = {
  public: {
    Tables: {
      menu_items: {
        Row: {
          id: string;
          vendor_id: string;
          name: string;
          description: string | null;
          price: number;
          currency: string | null;
          category: string | null;
          tags: string[] | null;
          image_url: string | null;
          is_available: boolean;
          options: MenuItemOption[] | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          description?: string | null;
          price: number;
          currency?: string | null;
          category?: string | null;
          tags?: string[] | null;
          image_url?: string | null;
          is_available: boolean;
          options?: MenuItemOption[] | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['menu_items']['Insert']>;
      };
      orders: {
        Row: {
          id: string;
          vendor_id: string;
          user_id: string;
          items: OrderItem[];
          status: OrderStatus;
          total: number;
          created_at: string;
          updated_at: string | null;
          eta_minutes: number | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          user_id: string;
          items: OrderItem[];
          status?: OrderStatus;
          total: number;
          created_at?: string;
          updated_at?: string | null;
          eta_minutes?: number | null;
          note?: string | null;
        };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
      };
      reward_activities: {
        Row: {
          id: string;
          user_id: string;
          vendor_id: string;
          points: number;
          type: 'earn' | 'redeem';
          description: string | null;
          occurred_at: string;
          order_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          vendor_id: string;
          points: number;
          type: 'earn' | 'redeem';
          description?: string | null;
          occurred_at?: string;
          order_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['reward_activities']['Insert']>;
      };
      users: {
        Row: {
          id: string;
          email: string;
          role: string;
          display_name: string | null;
          phone_number: string | null;
          photo_url: string | null;
          loyalty_points: number | null;
          preferred_vendor_id: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          role: string;
          display_name?: string | null;
          phone_number?: string | null;
          photo_url?: string | null;
          loyalty_points?: number | null;
          preferred_vendor_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      vendor_settings: {
        Row: {
          vendor_id: string;
          currency: string;
          timezone: string | null;
          enable_loyalty: boolean;
          loyalty_earn_rate: number | null;
          loyalty_redeem_rate: number | null;
          allow_scheduled_orders: boolean | null;
          default_prep_minutes: number | null;
          menu_version: string | null;
        };
        Insert: {
          vendor_id: string;
          currency: string;
          timezone?: string | null;
          enable_loyalty?: boolean;
          loyalty_earn_rate?: number | null;
          loyalty_redeem_rate?: number | null;
          allow_scheduled_orders?: boolean | null;
          default_prep_minutes?: number | null;
          menu_version?: string | null;
        };
        Update: Partial<Database['public']['Tables']['vendor_settings']['Insert']>;
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

  async signInWithEmail(email: string, password: string): Promise<User> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
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

  async getMenuItems(vendorId: string): Promise<MenuItem[]> {
    const { data, error } = await this.client.from('menu_items').select('*').eq('vendor_id', vendorId);
    if (error) throw error;
    return (data ?? []).map(mapMenuItemFromRow);
  }

  async upsertMenuItem(menuItem: MenuItemInput): Promise<MenuItem> {
    const { data, error } = await this.client
      .from('menu_items')
      .upsert(toMenuItemInsert(menuItem))
      .select()
      .single();
    if (error) throw error;
    return mapMenuItemFromRow(data);
  }

  async deleteMenuItem(menuItemId: string): Promise<void> {
    const { error } = await this.client.from('menu_items').delete().eq('id', menuItemId);
    if (error) throw error;
  }

  async createOrder(order: CreateOrderInput): Promise<Order> {
    const { data, error } = await this.client
      .from('orders')
      .insert(toOrderInsert(order))
      .select()
      .single();
    if (error) throw error;
    return mapOrderFromRow(data);
  }

  async getOrder(orderId: string): Promise<Order | null> {
    const { data, error } = await this.client.from('orders').select('*').eq('id', orderId).single();
    if (error) {
      if (error.code === 'PGRST116') return null; // row not found
      throw error;
    }
    return data ? mapOrderFromRow(data) : null;
  }

  async listOrdersForUser(userId: string): Promise<Order[]> {
    const { data, error } = await this.client
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapOrderFromRow);
  }

  async listOrdersForVendor(vendorId: string): Promise<Order[]> {
    const { data, error } = await this.client
      .from('orders')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapOrderFromRow);
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const { data, error } = await this.client
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw error;
    return mapOrderFromRow(data);
  }

  async fetchVendorSettings(vendorId: string): Promise<VendorSettings | null> {
    const { data, error } = await this.client.from('vendor_settings').select('*').eq('vendor_id', vendorId).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data ? mapVendorSettingsFromRow(data) : null;
  }

  async updateVendorSettings(vendorId: string, settings: Partial<VendorSettings>): Promise<VendorSettings> {
    const { data, error } = await this.client
      .from('vendor_settings')
      .upsert(toVendorSettingsUpdate(vendorId, settings), { onConflict: 'vendor_id' })
      .select()
      .single();
    if (error) throw error;
    return mapVendorSettingsFromRow(data);
  }

  async fetchRewardActivities(userId: string): Promise<RewardActivity[]> {
    const { data, error } = await this.client
      .from('reward_activities')
      .select('*')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRewardActivityFromRow);
  }

  async recordRewardActivity(activity: RewardActivityInput): Promise<RewardActivity> {
    const { data, error } = await this.client
      .from('reward_activities')
      .insert(toRewardActivityInsert(activity))
      .select()
      .single();
    if (error) throw error;
    return mapRewardActivityFromRow(data);
  }

  async adjustUserLoyaltyPoints(userId: string, delta: number): Promise<number> {
    const { data: existing, error: fetchError } = await this.client
      .from('users')
      .select('loyalty_points')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;
    const current = existing?.loyalty_points ?? 0;
    const next = Math.max(0, current + delta);

    const { error: updateError } = await this.client
      .from('users')
      .update({ loyalty_points: next })
      .eq('id', userId);

    if (updateError) throw updateError;
    return next;
  }

  subscribeToOrders(vendorId: string, handler: (order: Order) => void): Subscription {
    const channel = this.client
      .channel(`orders:${vendorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `vendor_id=eq.${vendorId}` },
        payload => {
          if (payload.new) {
            handler(mapOrderFromRow(payload.new as Database['public']['Tables']['orders']['Row']));
          }
        }
      )
      .subscribe();
    return wrapRealtimeChannel(channel);
  }

  subscribeToMenu(vendorId: string, handler: (menuItem: MenuItem) => void): Subscription {
    const channel = this.client
      .channel(`menu:${vendorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items', filter: `vendor_id=eq.${vendorId}` },
        payload => {
          if (payload.new) {
            handler(mapMenuItemFromRow(payload.new as Database['public']['Tables']['menu_items']['Row']));
          }
        }
      )
      .subscribe();
    return wrapRealtimeChannel(channel);
  }
}

const wrapRealtimeChannel = (channel: RealtimeChannel): Subscription => ({
  unsubscribe: () => channel.unsubscribe()
});

const mapAuthUser = (authUser: SupabaseAuthUser | null): User | null => {
  if (!authUser) return null;
  const metadata = authUser.user_metadata ?? {};
  return {
    id: authUser.id,
    email: authUser.email ?? '',
    role: (metadata.role as User['role']) ?? 'customer',
    displayName: (metadata.displayName as string | undefined) ?? (metadata.full_name as string | undefined),
    phoneNumber: (metadata.phone_number as string | undefined) ?? undefined,
    photoUrl: (metadata.avatar_url as string | undefined) ?? undefined,
    loyaltyPoints: (metadata.loyaltyPoints as number | undefined) ?? undefined,
    preferredVendorId: (metadata.preferredVendorId as string | undefined) ?? undefined
  };
};

const mapMenuItemFromRow = (row: Database['public']['Tables']['menu_items']['Row']): MenuItem => ({
  id: row.id,
  vendorId: row.vendor_id,
  name: row.name,
  description: row.description ?? undefined,
  price: row.price,
  currency: row.currency ?? undefined,
  category: row.category ?? undefined,
  tags: row.tags ?? undefined,
  imageUrl: row.image_url ?? undefined,
  isAvailable: row.is_available,
  options: row.options ?? undefined
});

const toMenuItemInsert = (
  menuItem: MenuItemInput
): Database['public']['Tables']['menu_items']['Insert'] => ({
  id: menuItem.id,
  vendor_id: menuItem.vendorId,
  name: menuItem.name,
  description: menuItem.description ?? null,
  price: menuItem.price,
  currency: menuItem.currency ?? null,
  category: menuItem.category ?? null,
  tags: menuItem.tags ?? null,
  image_url: menuItem.imageUrl ?? null,
  is_available: menuItem.isAvailable,
  options: menuItem.options ?? null,
  updated_at: new Date().toISOString()
});

const mapOrderFromRow = (row: Database['public']['Tables']['orders']['Row']): Order => ({
  id: row.id,
  vendorId: row.vendor_id,
  userId: row.user_id,
  items: row.items,
  status: row.status,
  total: row.total,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
  etaMinutes: row.eta_minutes ?? undefined,
  note: row.note ?? undefined
});

const toOrderInsert = (order: CreateOrderInput): Database['public']['Tables']['orders']['Insert'] => ({
  id: order.id,
  vendor_id: order.vendorId,
  user_id: order.userId,
  items: order.items,
  status: order.status ?? 'pending',
  total: order.total,
  created_at: order.createdAt ?? new Date().toISOString(),
  updated_at: order.updatedAt ?? null,
  eta_minutes: order.etaMinutes ?? null,
  note: order.note ?? null
});

const toRewardActivityInsert = (
  activity: RewardActivityInput
): Database['public']['Tables']['reward_activities']['Insert'] => ({
  id: activity.id,
  user_id: activity.userId,
  vendor_id: activity.vendorId,
  points: activity.points,
  type: activity.type,
  description: activity.description ?? null,
  occurred_at: activity.occurredAt ?? new Date().toISOString(),
  order_id: activity.orderId ?? null
});

const mapRewardActivityFromRow = (
  row: Database['public']['Tables']['reward_activities']['Row']
): RewardActivity => ({
  id: row.id,
  userId: row.user_id,
  vendorId: row.vendor_id,
  points: row.points,
  type: row.type,
  description: row.description ?? undefined,
  occurredAt: row.occurred_at,
  orderId: row.order_id ?? undefined
});

const mapVendorSettingsFromRow = (
  row: Database['public']['Tables']['vendor_settings']['Row']
): VendorSettings => ({
  vendorId: row.vendor_id,
  currency: row.currency,
  timezone: row.timezone ?? undefined,
  enableLoyalty: row.enable_loyalty,
  loyaltyEarnRate: row.loyalty_earn_rate ?? undefined,
  loyaltyRedeemRate: row.loyalty_redeem_rate ?? undefined,
  allowScheduledOrders: row.allow_scheduled_orders ?? undefined,
  defaultPrepMinutes: row.default_prep_minutes ?? undefined,
  menuVersion: row.menu_version ?? undefined
});

const toVendorSettingsUpdate = (
  vendorId: string,
  settings: Partial<VendorSettings>
): Database['public']['Tables']['vendor_settings']['Insert'] => ({
  vendor_id: vendorId,
  currency: settings.currency ?? 'USD',
  timezone: settings.timezone ?? null,
  enable_loyalty: settings.enableLoyalty ?? false,
  loyalty_earn_rate: settings.loyaltyEarnRate ?? null,
  loyalty_redeem_rate: settings.loyaltyRedeemRate ?? null,
  allow_scheduled_orders: settings.allowScheduledOrders ?? null,
  default_prep_minutes: settings.defaultPrepMinutes ?? null,
  menu_version: settings.menuVersion ?? null
});
