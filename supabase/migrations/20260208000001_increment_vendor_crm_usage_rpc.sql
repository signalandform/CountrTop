-- Atomic increment for CRM usage (used by send API via service role)
CREATE OR REPLACE FUNCTION increment_vendor_crm_usage(
  p_vendor_id text,
  p_period_start date,
  p_count int
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO vendor_crm_usage (vendor_id, period_start, emails_sent, updated_at)
  VALUES (p_vendor_id, p_period_start, p_count, now())
  ON CONFLICT (vendor_id, period_start)
  DO UPDATE SET
    emails_sent = vendor_crm_usage.emails_sent + p_count,
    updated_at = now();
$$;

COMMENT ON FUNCTION increment_vendor_crm_usage IS 'Atomically increment emails_sent for a vendor/period; used by CRM send API.';
