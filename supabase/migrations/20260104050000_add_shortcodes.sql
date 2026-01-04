-- =========================
-- KDS: Add shortcodes and promotion tracking
-- =========================

-- 1) Add shortcode column to kitchen_tickets
alter table public.kitchen_tickets
add column if not exists shortcode text;

-- 2) Add promoted_at column to track when ticket became active
alter table public.kitchen_tickets
add column if not exists promoted_at timestamptz;

-- 3) Add index for uniqueness checks (location_id + shortcode)
create index if not exists kitchen_tickets_location_shortcode_idx
on public.kitchen_tickets (location_id, shortcode)
where shortcode is not null;

-- 4) Add unique constraint: (location_id, shortcode) where shortcode is not null
-- Note: PostgreSQL doesn't support partial unique constraints directly,
-- so we'll use a unique index instead
create unique index if not exists kitchen_tickets_location_shortcode_unique_idx
on public.kitchen_tickets (location_id, shortcode)
where shortcode is not null;

-- 5) Add comment for documentation
comment on column public.kitchen_tickets.shortcode is 'Shortcode assigned when ticket is promoted to active queue (e.g., "1", "M31", "DS")';
comment on column public.kitchen_tickets.promoted_at is 'Timestamp when ticket was promoted from queued to active state';

