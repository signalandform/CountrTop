-- =========================
-- Vendor Billing (Stripe subscriptions)
-- =========================
-- One row per vendor; links to Stripe Customer and optional Subscription.
-- Plan: beta, trial, starter, pro. Status synced from Stripe webhooks.

CREATE TABLE IF NOT EXISTS vendor_billing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_id text NOT NULL DEFAULT 'beta',
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_billing_vendor_id ON vendor_billing(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_billing_stripe_customer ON vendor_billing(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_billing_stripe_subscription ON vendor_billing(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN vendor_billing.plan_id IS 'beta | trial | starter | pro';
COMMENT ON COLUMN vendor_billing.status IS 'Stripe subscription status: active, trialing, past_due, canceled, etc.';

CREATE OR REPLACE FUNCTION update_vendor_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_billing_updated_at
  BEFORE UPDATE ON vendor_billing
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_billing_updated_at();

ALTER TABLE vendor_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor admins can manage their billing"
  ON vendor_billing
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_billing.vendor_id
        AND vendors.admin_user_id = auth.uid()
    )
  );
