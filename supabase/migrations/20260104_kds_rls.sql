-- =========================
-- KDS RLS: kitchen_tickets + square_orders
-- =========================

-- 1) Enable RLS
alter table public.kitchen_tickets enable row level security;
alter table public.square_orders enable row level security;

-- 2) kitchen_tickets policies

-- SELECT: Vendor admin can read tickets for their location
drop policy if exists "kds_vendor_admin_select_kitchen_tickets" on public.kitchen_tickets;
create policy "kds_vendor_admin_select_kitchen_tickets"
on public.kitchen_tickets
for select
to authenticated
using (
  exists (
    select 1
    from public.vendors v
    where v.admin_user_id = auth.uid()
      and v.square_location_id = kitchen_tickets.location_id
  )
);

-- UPDATE: Vendor admin can update tickets for their location
drop policy if exists "kds_vendor_admin_update_kitchen_tickets" on public.kitchen_tickets;
create policy "kds_vendor_admin_update_kitchen_tickets"
on public.kitchen_tickets
for update
to authenticated
using (
  exists (
    select 1
    from public.vendors v
    where v.admin_user_id = auth.uid()
      and v.square_location_id = kitchen_tickets.location_id
  )
)
with check (
  exists (
    select 1
    from public.vendors v
    where v.admin_user_id = auth.uid()
      and v.square_location_id = kitchen_tickets.location_id
  )
);

-- NOTE:
-- No INSERT policy -> clients cannot create tickets (server-only)
-- No DELETE policy -> clients cannot delete tickets

-- 3) square_orders policies

-- SELECT: Vendor admin can read orders for their location
drop policy if exists "kds_vendor_admin_select_square_orders" on public.square_orders;
create policy "kds_vendor_admin_select_square_orders"
on public.square_orders
for select
to authenticated
using (
  exists (
    select 1
    from public.vendors v
    where v.admin_user_id = auth.uid()
      and v.square_location_id = square_orders.location_id
  )
);

-- NOTE:
-- No UPDATE/INSERT/DELETE policies -> clients cannot write square_orders

