-- =========================
-- KDS: Add promoted_at column to kitchen_tickets
-- =========================

-- Add promoted_at column to track when ticket was promoted to active queue
alter table public.kitchen_tickets
add column if not exists promoted_at timestamptz;

-- Add comment for documentation
comment on column public.kitchen_tickets.promoted_at is 'Timestamp when ticket was promoted from queued to active state';

