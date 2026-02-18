-- =========================
-- Milestone H: Vendor Feature Flags
-- =========================
-- Adds vendor_feature_flags table for vendor-specific feature toggles

CREATE TABLE IF NOT EXISTS vendor_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_vendor_feature_flags_vendor_id 
  ON vendor_feature_flags(vendor_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_vendor_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_feature_flags_updated_at
  BEFORE UPDATE ON vendor_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_feature_flags_updated_at();

-- RLS Policies
ALTER TABLE vendor_feature_flags ENABLE ROW LEVEL SECURITY;

-- Vendor admins can read/write flags for their vendor
CREATE POLICY "Vendor admins can manage their feature flags"
  ON vendor_feature_flags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_feature_flags.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );

-- Service role can read flags (for API endpoints)
-- Note: Service role bypasses RLS, so no policy needed

