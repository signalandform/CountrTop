-- Add trial_ends_at to vendor_billing for 30-day free trial timer
ALTER TABLE public.vendor_billing
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

COMMENT ON COLUMN public.vendor_billing.trial_ends_at IS 'When the free trial ends. Set at signup/creation for trial plan.';
