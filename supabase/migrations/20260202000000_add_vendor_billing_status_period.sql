-- Add status and current_period_end to vendor_billing for ops list and Stripe subscription state
ALTER TABLE public.vendor_billing
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

COMMENT ON COLUMN public.vendor_billing.status IS 'Subscription status (e.g. active, canceled) from Stripe';
COMMENT ON COLUMN public.vendor_billing.current_period_end IS 'Stripe subscription current_period_end for display';
