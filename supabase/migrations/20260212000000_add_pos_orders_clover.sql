-- =========================
-- Clover KDS MVP: pos_orders table + kitchen_tickets extensions
-- =========================

-- 1) pos_orders: provider-agnostic order mirror for Clover (and future POS)
CREATE TABLE IF NOT EXISTS public.pos_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  vendor_id text NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  vendor_location_id uuid NOT NULL REFERENCES public.vendor_locations(id) ON DELETE CASCADE,
  external_order_id text NOT NULL,
  external_location_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'paid', 'completed', 'canceled')),
  source text NOT NULL DEFAULT 'pos',
  order_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_orders_provider_external_order_id_key UNIQUE (provider, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_orders_vendor_location ON public.pos_orders(vendor_location_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_external_location ON public.pos_orders(external_location_id);

COMMENT ON TABLE public.pos_orders IS 'Provider-agnostic order mirror for Clover and other POS. Square uses square_orders.';

-- 2) kitchen_tickets: add pos_order_id and pos_canceled_at
ALTER TABLE public.kitchen_tickets
  ADD COLUMN IF NOT EXISTS pos_order_id uuid REFERENCES public.pos_orders(id) ON DELETE CASCADE;

ALTER TABLE public.kitchen_tickets
  ADD COLUMN IF NOT EXISTS pos_canceled_at timestamptz;

COMMENT ON COLUMN public.kitchen_tickets.pos_order_id IS 'FK to pos_orders for Clover and other non-Square POS. When set, square_order_id is null.';
COMMENT ON COLUMN public.kitchen_tickets.pos_canceled_at IS 'When POS order was canceled/voided. Ticket moved to Ready lane, user manually marks Complete.';

-- 3) Make square_order_id nullable (Clover tickets use pos_order_id instead)
-- Check constraint: either square_order_id or pos_order_id must be set (enforced in app for now)
ALTER TABLE public.kitchen_tickets
  ALTER COLUMN square_order_id DROP NOT NULL;

-- 4) vendor_locations: index for provider + external id lookup
CREATE INDEX IF NOT EXISTS idx_vendor_locations_pos_provider_square_location_id
  ON public.vendor_locations(pos_provider, square_location_id);

-- 5) pos_orders RLS
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;

-- SELECT: Vendor admin can read their vendor's pos_orders
DROP POLICY IF EXISTS "kds_vendor_admin_select_pos_orders" ON public.pos_orders;
CREATE POLICY "kds_vendor_admin_select_pos_orders"
ON public.pos_orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = pos_orders.vendor_id
      AND v.admin_user_id = auth.uid()
  )
);

-- No INSERT/UPDATE/DELETE policies -> server-only (webhook processor)

-- 6) Extend kitchen_tickets RLS for multi-location (vendor_locations)
-- Allow access when location_id matches any vendor_location for that vendor
DROP POLICY IF EXISTS "kds_vendor_admin_select_kitchen_tickets" ON public.kitchen_tickets;
CREATE POLICY "kds_vendor_admin_select_kitchen_tickets"
ON public.kitchen_tickets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.admin_user_id = auth.uid()
      AND (
        v.square_location_id = kitchen_tickets.location_id
        OR EXISTS (
          SELECT 1 FROM public.vendor_locations vl
          WHERE vl.vendor_id = v.id
            AND vl.square_location_id = kitchen_tickets.location_id
        )
      )
  )
);

DROP POLICY IF EXISTS "kds_vendor_admin_update_kitchen_tickets" ON public.kitchen_tickets;
CREATE POLICY "kds_vendor_admin_update_kitchen_tickets"
ON public.kitchen_tickets
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.admin_user_id = auth.uid()
      AND (
        v.square_location_id = kitchen_tickets.location_id
        OR EXISTS (
          SELECT 1 FROM public.vendor_locations vl
          WHERE vl.vendor_id = v.id
            AND vl.square_location_id = kitchen_tickets.location_id
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.admin_user_id = auth.uid()
      AND (
        v.square_location_id = kitchen_tickets.location_id
        OR EXISTS (
          SELECT 1 FROM public.vendor_locations vl
          WHERE vl.vendor_id = v.id
            AND vl.square_location_id = kitchen_tickets.location_id
        )
      )
  )
);
