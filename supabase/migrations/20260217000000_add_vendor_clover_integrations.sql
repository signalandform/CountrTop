-- Clover OAuth integration per vendor (per environment)
-- Tokens stored server-side; never exposed to browser
CREATE TABLE IF NOT EXISTS vendor_clover_integrations (
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  clover_environment text NOT NULL CHECK (clover_environment IN ('sandbox', 'production')),
  merchant_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  connection_status text NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'expired', 'revoked', 'error')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  PRIMARY KEY (vendor_id, clover_environment)
);

COMMENT ON TABLE vendor_clover_integrations IS 'Per-vendor Clover OAuth tokens. Sandbox and production are separate rows.';
COMMENT ON COLUMN vendor_clover_integrations.access_token IS 'OAuth access token from Clover. Server-only.';
COMMENT ON COLUMN vendor_clover_integrations.refresh_token IS 'OAuth refresh token from Clover. Server-only.';
COMMENT ON COLUMN vendor_clover_integrations.merchant_id IS 'Clover merchant ID from OAuth callback.';

CREATE INDEX IF NOT EXISTS idx_vendor_clover_integrations_vendor_id ON vendor_clover_integrations(vendor_id);

ALTER TABLE vendor_clover_integrations ENABLE ROW LEVEL SECURITY;

-- Vendor admins can read integration status (not tokens - service role handles token access)
CREATE POLICY "Vendor admins can read their Clover integration status"
  ON vendor_clover_integrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_clover_integrations.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );

-- INSERT/UPDATE: only service role (OAuth callback, token refresh)
CREATE POLICY "Only service role can insert or update Clover integrations"
  ON vendor_clover_integrations
  FOR ALL
  USING (false)
  WITH CHECK (false);
