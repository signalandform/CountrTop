-- Add KDS nav view setting: full (buttons with labels) or minimized (icon-only)
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS kds_nav_view text DEFAULT 'full'
  CHECK (kds_nav_view IN ('full', 'minimized'));

COMMENT ON COLUMN public.vendors.kds_nav_view IS 'KDS header: full (buttons with labels) or minimized (icon-only)';
