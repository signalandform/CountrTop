-- Vendor billing (Stripe subscription / plan) - one row per vendor
-- Used by vendor-admin for plan gating (beta, trial, starter, pro)

CREATE TABLE IF NOT EXISTS vendor_billing (
  vendor_id text PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  plan_id text NOT NULL DEFAULT 'beta' CHECK (plan_id IN ('beta', 'trial', 'starter', 'pro')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_vendor_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vendor_billing_updated_at ON vendor_billing;
CREATE TRIGGER vendor_billing_updated_at
  BEFORE UPDATE ON vendor_billing
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_billing_updated_at();

-- RLS: vendor admins can read their vendor's billing; service role for API
ALTER TABLE vendor_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor admins can read their billing"
  ON vendor_billing
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_billing.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );
