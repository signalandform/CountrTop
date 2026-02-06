-- Per-vendor, per-catalog-item availability and internal stock overrides
CREATE TABLE IF NOT EXISTS vendor_menu_availability (
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  catalog_item_id text NOT NULL,
  variation_id text NOT NULL,
  available boolean NOT NULL DEFAULT true,
  internal_stock_count int,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, catalog_item_id)
);

COMMENT ON TABLE vendor_menu_availability IS 'Vendor overrides for menu item availability and internal stock count. Items not in this table are treated as available with no stock.';
COMMENT ON COLUMN vendor_menu_availability.catalog_item_id IS 'Square catalog object id (item id).';
COMMENT ON COLUMN vendor_menu_availability.variation_id IS 'Square variation id (first/default variation used for orders).';
COMMENT ON COLUMN vendor_menu_availability.internal_stock_count IS 'Vendor internal stock count; optional, for their own tracking.';

CREATE INDEX IF NOT EXISTS idx_vendor_menu_availability_vendor_id ON vendor_menu_availability(vendor_id);

ALTER TABLE vendor_menu_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor admins can manage their menu availability"
  ON vendor_menu_availability
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_menu_availability.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_menu_availability.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );
