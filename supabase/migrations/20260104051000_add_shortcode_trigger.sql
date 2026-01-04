-- =========================
-- KDS: Add shortcode auto-generation trigger
-- =========================

-- 0) Ensure shortcode column exists (idempotent)
alter table public.kitchen_tickets
add column if not exists shortcode text;

-- 1) Create helper function to generate shortcode
-- Uses hexadecimal (0-9, A-F) for human-readable 4-character codes
-- Retries until unique within location
create or replace function public.generate_kitchen_ticket_shortcode(loc_id text)
returns text
language plpgsql
as $$
declare
  candidate text;
  exists_count int;
begin
  loop
    -- Generate 4-char uppercase hexadecimal code from random
    -- Using MD5 hash of random + timestamp for better distribution
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

    -- Check if this shortcode already exists for this location
    select count(*) into exists_count
    from public.kitchen_tickets
    where location_id = loc_id
      and shortcode = candidate;

    -- If unique, return it
    if exists_count = 0 then
      return candidate;
    end if;
  end loop;
end;
$$;

-- 2) Create trigger function to auto-populate shortcode on insert
create or replace function public.kitchen_tickets_set_shortcode()
returns trigger
language plpgsql
as $$
begin
  -- Only generate if shortcode is not already set
  if new.shortcode is null then
    new.shortcode := public.generate_kitchen_ticket_shortcode(new.location_id);
  end if;
  return new;
end;
$$;

-- 3) Drop existing trigger if it exists (idempotent)
drop trigger if exists trg_kitchen_tickets_set_shortcode on public.kitchen_tickets;

-- 4) Create trigger
create trigger trg_kitchen_tickets_set_shortcode
before insert on public.kitchen_tickets
for each row
execute function public.kitchen_tickets_set_shortcode();

-- 5) Backfill existing rows that don't have shortcodes
update public.kitchen_tickets
set shortcode = public.generate_kitchen_ticket_shortcode(location_id)
where shortcode is null;

-- 6) Ensure unique constraint exists (may already exist from previous migration)
-- This enforces uniqueness per location
create unique index if not exists kitchen_tickets_location_shortcode_unique
on public.kitchen_tickets(location_id, shortcode);

-- 7) Optional index for fast shortcode lookups
create index if not exists kitchen_tickets_shortcode_idx
on public.kitchen_tickets(shortcode);

-- 8) Add comment for documentation
comment on function public.generate_kitchen_ticket_shortcode is 'Generates a unique 4-character uppercase shortcode for a kitchen ticket within a location';
comment on function public.kitchen_tickets_set_shortcode is 'Trigger function to auto-generate shortcode on kitchen_tickets insert if not provided';

