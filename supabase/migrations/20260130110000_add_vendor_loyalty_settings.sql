-- =========================
-- Loyalty Redemption: vendor_loyalty_settings
-- =========================
-- One row per vendor; redemption rules for points-as-discount at checkout.

CREATE TABLE IF NOT EXISTS vendor_loyalty_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  cents_per_point integer NOT NULL DEFAULT 1,
  min_points_to_redeem integer NOT NULL DEFAULT 100,
  max_points_per_order integer NOT NULL DEFAULT 500,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_loyalty_settings_vendor_id
  ON vendor_loyalty_settings(vendor_id);

COMMENT ON COLUMN vendor_loyalty_settings.cents_per_point IS 'Redemption rate: e.g. 1 = 100 points -> $1 (100 cents)';
COMMENT ON COLUMN vendor_loyalty_settings.min_points_to_redeem IS 'Minimum points required to redeem in one order';
COMMENT ON COLUMN vendor_loyalty_settings.max_points_per_order IS 'Maximum points that can be redeemed per order';

CREATE OR REPLACE FUNCTION update_vendor_loyalty_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_loyalty_settings_updated_at
  BEFORE UPDATE ON vendor_loyalty_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_loyalty_settings_updated_at();

ALTER TABLE vendor_loyalty_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor admins can manage their loyalty settings"
  ON vendor_loyalty_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_loyalty_settings.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );
