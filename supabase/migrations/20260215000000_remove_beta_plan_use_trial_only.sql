-- Remove beta plan: use trial only. Backfill existing beta rows, then restrict plan_id to trial/starter/pro/kds_only/online_only.

UPDATE public.vendor_billing
SET plan_id = 'trial'
WHERE plan_id = 'beta';

ALTER TABLE public.vendor_billing
  ALTER COLUMN plan_id SET DEFAULT 'trial';

ALTER TABLE public.vendor_billing
  DROP CONSTRAINT IF EXISTS vendor_billing_plan_id_check;

ALTER TABLE public.vendor_billing
  ADD CONSTRAINT vendor_billing_plan_id_check
  CHECK (plan_id IN ('trial', 'starter', 'pro', 'kds_only', 'online_only'));

COMMENT ON COLUMN public.vendor_billing.plan_id IS 'Plan: trial, starter, pro, kds_only (15/loc/mo), online_only (25/loc/mo).';
