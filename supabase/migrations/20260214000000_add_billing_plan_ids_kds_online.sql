-- Allow vendor_billing.plan_id to be kds_only or online_only (per-location plans)
ALTER TABLE public.vendor_billing
  DROP CONSTRAINT IF EXISTS vendor_billing_plan_id_check;

ALTER TABLE public.vendor_billing
  ADD CONSTRAINT vendor_billing_plan_id_check
  CHECK (plan_id IN ('beta', 'trial', 'starter', 'pro', 'kds_only', 'online_only'));

COMMENT ON COLUMN public.vendor_billing.plan_id IS 'Plan: beta, trial, starter, pro, kds_only (15/loc/mo), online_only (25/loc/mo).';
