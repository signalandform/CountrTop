-- Prevent duplicate order snapshots per vendor per Square order
-- Handles existing duplicates by keeping the earliest row per (vendor_id, square_order_id)
DELETE FROM public.order_snapshots a
USING public.order_snapshots b
WHERE a.vendor_id = b.vendor_id AND a.square_order_id = b.square_order_id
  AND a.placed_at > b.placed_at;

ALTER TABLE public.order_snapshots
  ADD CONSTRAINT order_snapshots_vendor_square_order_unique
  UNIQUE (vendor_id, square_order_id);
