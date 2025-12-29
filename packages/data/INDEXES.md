# Database Indexes for CountrTop

This document lists the recommended database indexes for optimal query performance.

## Required Indexes

Run these SQL commands in your Supabase SQL editor to create the indexes:

```sql
-- Vendors table indexes
CREATE INDEX IF NOT EXISTS idx_vendors_slug ON vendors(slug);
CREATE INDEX IF NOT EXISTS idx_vendors_square_location_id ON vendors(square_location_id);

-- Order snapshots table indexes
CREATE INDEX IF NOT EXISTS idx_order_snapshots_vendor_id ON order_snapshots(vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_snapshots_user_id ON order_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_order_snapshots_vendor_square_order ON order_snapshots(vendor_id, square_order_id);
CREATE INDEX IF NOT EXISTS idx_order_snapshots_placed_at ON order_snapshots(placed_at DESC);

-- Loyalty ledger table indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_vendor_user ON loyalty_ledger(vendor_id, user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_created_at ON loyalty_ledger(created_at DESC);

-- Push devices table indexes
CREATE INDEX IF NOT EXISTS idx_push_devices_user_id ON push_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_user_token ON push_devices(user_id, device_token);
```

## Index Usage

- **vendor_id indexes**: Used for filtering orders and loyalty entries by vendor
- **user_id indexes**: Used for filtering orders, loyalty entries, and push devices by user
- **created_at/placed_at indexes**: Used for sorting queries (DESC order for recent-first)
- **Composite indexes**: Used for queries that filter by multiple columns (e.g., vendor_id + square_order_id)

## Performance Notes

- Indexes are automatically used by PostgreSQL when they improve query performance
- Monitor query performance using the `logQueryPerformance` function in `supabaseClient.ts`
- Consider adding additional indexes if you notice slow queries in production

