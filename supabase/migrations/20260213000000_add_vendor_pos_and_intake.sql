-- Vendor POS choice (from signup intake) and vendor_intake table for feature needs
-- Do not default pos_provider to 'square'; new signups set it explicitly.

-- 1) vendors: add pos_provider (nullable for existing rows)
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS pos_provider text CHECK (pos_provider IS NULL OR pos_provider IN ('square', 'clover'));

COMMENT ON COLUMN public.vendors.pos_provider IS 'POS provider chosen at signup (Square or Clover). Do not default to square when unknown.';

-- 2) vendor_intake: one row per vendor, populated at signup
CREATE TABLE IF NOT EXISTS public.vendor_intake (
  vendor_id text PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  locations_count int,
  needs_kds boolean NOT NULL DEFAULT false,
  needs_online_ordering boolean NOT NULL DEFAULT false,
  needs_scheduled_orders boolean NOT NULL DEFAULT false,
  needs_loyalty boolean NOT NULL DEFAULT false,
  needs_crm boolean NOT NULL DEFAULT false,
  needs_time_tracking boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vendor_intake IS 'Vendor signup intake: locations count and feature needs (KDS, online ordering, etc.).';

CREATE INDEX IF NOT EXISTS idx_vendor_intake_vendor_id ON public.vendor_intake(vendor_id);

CREATE OR REPLACE FUNCTION update_vendor_intake_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vendor_intake_updated_at ON public.vendor_intake;
CREATE TRIGGER vendor_intake_updated_at
  BEFORE UPDATE ON public.vendor_intake
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_intake_updated_at();

ALTER TABLE public.vendor_intake ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor admins can read their intake"
  ON public.vendor_intake
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_intake.vendor_id
        AND v.admin_user_id = auth.uid()
    )
  );

-- INSERT/UPDATE only via service role (signup prepare API)
CREATE POLICY "Only service role can insert or update vendor_intake"
  ON public.vendor_intake
  FOR ALL
  USING (false)
  WITH CHECK (false);
