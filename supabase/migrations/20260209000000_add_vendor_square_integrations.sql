-- Square OAuth integration per vendor (per environment)
-- Tokens and integration data stored server-side; never exposed to browser
CREATE TABLE IF NOT EXISTS vendor_square_integrations (
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  square_environment text NOT NULL CHECK (square_environment IN ('sandbox', 'production')),
  square_access_token text NOT NULL,
  square_refresh_token text NOT NULL,
  square_merchant_id text,
  available_location_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_location_id text,
  connection_status text NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'expired', 'revoked', 'error')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  PRIMARY KEY (vendor_id, square_environment)
);

COMMENT ON TABLE vendor_square_integrations IS 'Per-vendor Square OAuth tokens and integration state. Sandbox and production are separate rows.';
COMMENT ON COLUMN vendor_square_integrations.square_access_token IS 'OAuth access token from Square. Server-only.';
COMMENT ON COLUMN vendor_square_integrations.square_refresh_token IS 'OAuth refresh token from Square. Server-only.';
COMMENT ON COLUMN vendor_square_integrations.available_location_ids IS 'JSON array of Square location IDs from listLocations.';
COMMENT ON COLUMN vendor_square_integrations.selected_location_id IS 'Primary/default location for checkout.';

CREATE INDEX IF NOT EXISTS idx_vendor_square_integrations_vendor_id ON vendor_square_integrations(vendor_id);

ALTER TABLE vendor_square_integrations ENABLE ROW LEVEL SECURITY;

-- Vendor admins can read integration status (not tokens - service role handles token access)
-- SELECT: vendor admin can see that they have a connection (status, merchant_id, etc.)
CREATE POLICY "Vendor admins can read their Square integration status"
  ON vendor_square_integrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_square_integrations.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );

-- INSERT/UPDATE: only service role (OAuth callback, token refresh)
-- Deny direct insert/update by authenticated users
CREATE POLICY "Only service role can insert or update Square integrations"
  ON vendor_square_integrations
  FOR ALL
  USING (false)
  WITH CHECK (false);
