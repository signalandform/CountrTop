-- Scheduled orders: allow customers to pick future pickup times
-- For vendors selling pre-portioned meals where soonest pickup may be days away

ALTER TABLE public.vendor_locations
  ADD COLUMN IF NOT EXISTS scheduled_orders_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_order_lead_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS scheduled_order_slot_minutes integer NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.vendor_locations.scheduled_orders_enabled IS 'Allow customers to select a future pickup time slot';
COMMENT ON COLUMN public.vendor_locations.scheduled_order_lead_days IS 'Max days in advance for scheduled pickup (e.g., 7 = up to a week ahead)';
COMMENT ON COLUMN public.vendor_locations.scheduled_order_slot_minutes IS 'Slot granularity in minutes (15, 30, or 60)';
