-- =========================
-- Vendor email unsubscribes (CRM promotional emails)
-- =========================
-- Records when a customer unsubscribes from a vendor's promotional emails.
-- Used by CRM send to exclude these addresses.

CREATE TABLE IF NOT EXISTS vendor_email_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, email)
);

CREATE INDEX IF NOT EXISTS idx_vendor_email_unsubscribes_vendor_id
  ON vendor_email_unsubscribes(vendor_id);

COMMENT ON TABLE vendor_email_unsubscribes IS 'Customers who unsubscribed from vendor promotional emails (CRM)';

ALTER TABLE vendor_email_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage vendor_email_unsubscribes"
  ON vendor_email_unsubscribes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
