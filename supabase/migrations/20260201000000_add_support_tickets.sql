-- =========================
-- Support tickets (vendor -> ops)
-- =========================
-- Vendors submit tickets from admin Support page; ops view/update from Support inbox.
-- Single message per ticket + optional ops reply. Status: open | in_progress | closed.

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  submitted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ops_reply text,
  ops_replied_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_vendor_id ON support_tickets(vendor_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);

COMMENT ON COLUMN support_tickets.status IS 'open | in_progress | closed';
COMMENT ON COLUMN support_tickets.submitted_by IS 'Auth user id of vendor admin who submitted';
COMMENT ON COLUMN support_tickets.ops_reply IS 'Optional reply from ops';

CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_tickets_updated_at();

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage support_tickets"
  ON support_tickets
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
