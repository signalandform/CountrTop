-- CRM promotional email usage per calendar month (UTC)
CREATE TABLE IF NOT EXISTS vendor_crm_usage (
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  emails_sent int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, period_start)
);

COMMENT ON TABLE public.vendor_crm_usage IS 'CRM emails sent per vendor per calendar month (period_start = YYYY-MM-01 UTC)';

ALTER TABLE vendor_crm_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor admins can read their CRM usage"
  ON vendor_crm_usage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_crm_usage.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );

-- Updates (increment) are done via service role in the send API
CREATE POLICY "Vendor admins cannot insert or update CRM usage"
  ON vendor_crm_usage
  FOR ALL
  USING (false)
  WITH CHECK (false);
