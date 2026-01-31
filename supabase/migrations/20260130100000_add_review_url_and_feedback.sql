-- Vendor: review link for customer "Leave us a review" CTA
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS review_url TEXT NULL;

-- Order snapshots: customer thumbs up/down for vendor analytics
ALTER TABLE public.order_snapshots
  ADD COLUMN IF NOT EXISTS customer_feedback_rating TEXT NULL;

COMMENT ON COLUMN public.vendors.review_url IS 'Vendor-supplied review link (e.g. Google/Yelp) for customer storefront CTA';
COMMENT ON COLUMN public.order_snapshots.customer_feedback_rating IS 'Customer feedback: thumbs_up or thumbs_down; one per order for analytics';
