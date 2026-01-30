create table if not exists kds_pairing_tokens (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  location_id text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists kds_pairing_tokens_vendor_id_idx
  on kds_pairing_tokens (vendor_id);

create index if not exists kds_pairing_tokens_active_idx
  on kds_pairing_tokens (vendor_id, location_id)
  where used_at is null;

alter table kds_pairing_tokens enable row level security;

create policy "Vendor admins can manage KDS pairing tokens"
  on kds_pairing_tokens
  for all
  using (
    exists (
      select 1 from vendors
      where vendors.id = kds_pairing_tokens.vendor_id
        and vendors.admin_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from vendors
      where vendors.id = kds_pairing_tokens.vendor_id
        and vendors.admin_user_id = auth.uid()
    )
  );
