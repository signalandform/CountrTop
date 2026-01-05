-- =========================
-- Milestone A: Vendor Location PINs
-- =========================
-- Adds vendor_location_pins table for KDS PIN authentication

CREATE TABLE IF NOT EXISTS vendor_location_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  location_id text NOT NULL,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_location_pins_vendor_location 
  ON vendor_location_pins(vendor_id, location_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_vendor_location_pins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_location_pins_updated_at
  BEFORE UPDATE ON vendor_location_pins
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_location_pins_updated_at();

-- RLS Policies
ALTER TABLE vendor_location_pins ENABLE ROW LEVEL SECURITY;

-- Vendor admins can read/write pins for their vendor
CREATE POLICY "Vendor admins can manage their location pins"
  ON vendor_location_pins
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_location_pins.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );

-- Service role can read pins (for PIN auth endpoint)
-- Note: Service role bypasses RLS, so no policy needed

