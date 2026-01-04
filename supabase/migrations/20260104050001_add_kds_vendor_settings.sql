-- =========================
-- KDS: Add vendor settings for queue throttling
-- =========================

-- 1) Add kds_active_limit_total column (default 10)
alter table public.vendors
add column if not exists kds_active_limit_total integer default 10;

-- 2) Add kds_active_limit_ct column (default 10)
alter table public.vendors
add column if not exists kds_active_limit_ct integer default 10;

-- 3) Add comments for documentation
comment on column public.vendors.kds_active_limit_total is 'Maximum number of active tickets to show in KDS queue (all sources)';
comment on column public.vendors.kds_active_limit_ct is 'Maximum number of active CountrTop orders to show in KDS queue';

