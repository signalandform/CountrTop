-- Vendor order milestones: congrats + incentives (shirt, plaque) for CountrTop online order counts
-- Vendors see banners when crossing thresholds; incentives require ops to mark claimed_at

CREATE TABLE IF NOT EXISTS vendor_order_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  milestone int NOT NULL,
  milestone_type text NOT NULL CHECK (milestone_type IN ('congrats', 'incentive_shirt', 'incentive_plaque')),
  seen_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  UNIQUE(vendor_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_vendor_order_milestones_vendor_id
  ON vendor_order_milestones(vendor_id);

ALTER TABLE vendor_order_milestones ENABLE ROW LEVEL SECURITY;

-- Vendor admins can select and update (seen_at) their own vendor's milestones
CREATE POLICY "Vendor admins can select their order milestones"
  ON vendor_order_milestones
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_order_milestones.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );

CREATE POLICY "Vendor admins can update their order milestones (seen_at)"
  ON vendor_order_milestones
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_order_milestones.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_order_milestones.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );

-- Insert: vendor admins can insert when they see a new milestone (upsert via API)
CREATE POLICY "Vendor admins can insert their order milestones"
  ON vendor_order_milestones
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_order_milestones.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );

-- Ops/service_role bypasses RLS for claim operations; no extra policy needed
