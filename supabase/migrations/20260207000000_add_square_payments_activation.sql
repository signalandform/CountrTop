-- Square payments activation status for vendor-by-vendor OAuth
-- Vendors must activate their Square account for production payments; we detect and guide this during onboarding.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS square_payments_activated boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS square_payments_activation_checked_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS square_payments_activation_error text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS square_payments_activation_location_id text DEFAULT NULL;

COMMENT ON COLUMN public.vendors.square_payments_activated IS 'Whether Square merchant account is activated for production card payments. NULL = not yet checked.';
COMMENT ON COLUMN public.vendors.square_payments_activation_checked_at IS 'When we last ran the Square payments activation check.';
COMMENT ON COLUMN public.vendors.square_payments_activation_error IS 'Error message from last check if it failed (network, token, or account not activated).';
COMMENT ON COLUMN public.vendors.square_payments_activation_location_id IS 'Square location ID used for the check (optional, for multi-location vendors).';
