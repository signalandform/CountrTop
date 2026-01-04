-- =========================
-- Milestone 8.5: Analytics Indexes
-- =========================
-- Adds indexes required for analytics queries (KDS performance, revenue, customer analytics)

-- KDS Performance Analytics: Time-range queries on kitchen_tickets
-- Note: kitchen_tickets_location_placed_idx already exists with DESC order
-- This adds a composite index for status-filtered time queries
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_location_status_placed_at
  ON public.kitchen_tickets(location_id, status, placed_at);

-- Revenue Analytics: Time-range queries on square_orders
-- Note: square_orders_location_updated_idx already exists
-- This adds an index on created_at for revenue time-series queries
CREATE INDEX IF NOT EXISTS idx_square_orders_location_created_at
  ON public.square_orders(location_id, created_at);

-- Customer Analytics: User-based queries (partial index for CountrTop orders only)
-- This is a partial index to efficiently filter CountrTop online orders
CREATE INDEX IF NOT EXISTS idx_order_snapshots_vendor_user_placed_at
  ON public.order_snapshots(vendor_id, user_id, placed_at)
  WHERE user_id IS NOT NULL;

-- Note: The following indexes already exist and are sufficient:
-- - kitchen_tickets_location_placed_idx (location_id, placed_at DESC)
-- - kitchen_tickets_location_status_idx (location_id, status)
-- - square_orders_location_updated_idx (location_id, updated_at DESC)
-- These new indexes complement the existing ones for analytics queries.

