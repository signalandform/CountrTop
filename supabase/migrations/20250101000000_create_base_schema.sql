-- =========================
-- Base schema: tables that exist on remote but have no creation migration in repo.
-- Extracted from backup. Must run first (earliest timestamp).
-- =========================

-- 1) set_updated_at: used by order_snapshots and profiles triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2) handle_new_user: auth trigger for profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    'customer',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3) vendors (no deps)
CREATE TABLE IF NOT EXISTS public.vendors (
  id text NOT NULL PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  square_location_id text NOT NULL,
  square_credential_ref text,
  status text,
  admin_user_id uuid,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  phone text,
  timezone text,
  pickup_instructions text,
  kds_active_limit_total integer DEFAULT 10,
  kds_active_limit_ct integer DEFAULT 10,
  theme_preference text DEFAULT 'dark' CHECK (theme_preference IN ('light', 'dark')),
  logo_url text,
  primary_color text DEFAULT '#667eea' CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text DEFAULT '#764ba2' CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  font_family text DEFAULT 'SF Pro Display',
  pos_provider text NOT NULL DEFAULT 'square' CHECK (pos_provider IN ('square', 'clover', 'toast')),
  review_url text,
  square_payments_activated boolean,
  square_payments_activation_checked_at timestamptz,
  square_payments_activation_error text,
  square_payments_activation_location_id text,
  kds_nav_view text DEFAULT 'full' CHECK (kds_nav_view IN ('full', 'minimized'))
);

-- 4) profiles (id references auth.users; Supabase provides auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('customer', 'vendor_admin', 'admin')),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger on auth.users to create profile on signup (Supabase standard pattern)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5) vendor_locations (vendor_id -> vendors)
CREATE TABLE IF NOT EXISTS public.vendor_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id text NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  square_location_id text NOT NULL UNIQUE,
  name text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  phone text,
  timezone text DEFAULT 'America/New_York',
  pickup_instructions text,
  online_ordering_enabled boolean NOT NULL DEFAULT true,
  kds_active_limit_total integer DEFAULT 10,
  kds_active_limit_ct integer DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  pos_provider text NOT NULL DEFAULT 'square' CHECK (pos_provider IN ('square', 'toast', 'clover')),
  kds_auto_bump_minutes integer,
  kds_sound_alerts_enabled boolean DEFAULT true,
  kds_display_mode text DEFAULT 'grid' CHECK (kds_display_mode IN ('grid', 'list')),
  online_ordering_lead_time_minutes integer DEFAULT 15,
  online_ordering_hours_json jsonb,
  scheduled_orders_enabled boolean NOT NULL DEFAULT false,
  scheduled_order_lead_days integer NOT NULL DEFAULT 7,
  scheduled_order_slot_minutes integer NOT NULL DEFAULT 30
);

-- 6) square_orders (no deps)
CREATE TABLE IF NOT EXISTS public.square_orders (
  square_order_id text NOT NULL PRIMARY KEY,
  location_id text NOT NULL,
  state text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  reference_id text,
  metadata jsonb,
  line_items jsonb,
  fulfillment jsonb,
  source text NOT NULL CHECK (source IN ('countrtop_online', 'square_pos', 'toast_pos', 'clover_pos', 'pos')),
  raw jsonb,
  pos_provider text NOT NULL DEFAULT 'square' CHECK (pos_provider IN ('square', 'toast', 'clover'))
);

-- 7) kitchen_tickets (square_order_id -> square_orders; pos_order_id added later by 20260212)
-- Exclude pos_order_id, pos_canceled_at - added by 20260212000000 after pos_orders exists
CREATE TABLE IF NOT EXISTS public.kitchen_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  square_order_id text UNIQUE REFERENCES public.square_orders(square_order_id) ON DELETE CASCADE,
  location_id text NOT NULL,
  ct_reference_id text,
  customer_user_id uuid,
  source text NOT NULL CHECK (source IN ('countrtop_online', 'square_pos', 'toast_pos', 'clover_pos', 'pos')),
  status text NOT NULL CHECK (status IN ('placed', 'preparing', 'ready', 'completed', 'canceled')),
  placed_at timestamptz NOT NULL,
  ready_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  last_updated_by_vendor_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  shortcode text,
  promoted_at timestamptz,
  pos_provider text NOT NULL DEFAULT 'square' CHECK (pos_provider IN ('square', 'toast', 'clover')),
  held_at timestamptz,
  held_reason text,
  staff_notes text,
  custom_label text,
  priority_order integer DEFAULT 0
);

-- 8) order_snapshots (vendor_id -> vendors)
CREATE TABLE IF NOT EXISTS public.order_snapshots (
  id text NOT NULL PRIMARY KEY,
  vendor_id text NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id uuid,
  square_order_id text NOT NULL,
  placed_at timestamptz NOT NULL,
  snapshot_json jsonb NOT NULL,
  fulfillment_status text NOT NULL DEFAULT 'PLACED' CHECK (fulfillment_status IN ('PLACED', 'READY', 'COMPLETE')),
  ready_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  customer_display_name text,
  pickup_label text,
  customer_feedback_rating text
);

CREATE TRIGGER order_snapshots_set_updated_at
  BEFORE UPDATE ON public.order_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9) employees (vendor_id -> vendors)
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id text NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  name text NOT NULL,
  pin text NOT NULL CHECK (pin ~ '^[0-9]{3}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, pin)
);

-- 10) loyalty_ledger (vendor_id -> vendors)
CREATE TABLE IF NOT EXISTS public.loyalty_ledger (
  id text NOT NULL PRIMARY KEY,
  vendor_id text NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  order_id text NOT NULL,
  points_delta integer NOT NULL,
  created_at timestamptz NOT NULL
);

-- 11) push_devices (user_id -> auth.users)
CREATE TABLE IF NOT EXISTS public.push_devices (
  id text NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token text NOT NULL,
  platform text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz
);

-- 12) support_tickets (vendor_id -> vendors)
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id text NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  submitted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ops_reply text,
  ops_replied_at timestamptz
);

-- 13) vendor_loyalty_settings (vendor_id -> vendors)
CREATE TABLE IF NOT EXISTS public.vendor_loyalty_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id text NOT NULL UNIQUE REFERENCES public.vendors(id) ON DELETE CASCADE,
  cents_per_point integer NOT NULL DEFAULT 1,
  min_points_to_redeem integer NOT NULL DEFAULT 100,
  max_points_per_order integer NOT NULL DEFAULT 500,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 14) vendor_email_unsubscribes (vendor_id -> vendors)
CREATE TABLE IF NOT EXISTS public.vendor_email_unsubscribes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id text NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, email)
);

-- 15) time_entries (vendor_id -> vendors, employee_id -> employees)
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id text NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_in_at timestamptz NOT NULL,
  clock_out_at timestamptz,
  location_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at)
);
