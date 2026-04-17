create type gift_card_upload_type as enum (
  'pdf_per_page',
  'pdf_per_4_pages',
  'csv_link'
);

create type gift_card_upload_status as enum (
  'uploaded',
  'processing',
  'processed',
  'failed'
);

create type gift_card_asset_status as enum (
  'available',
  'sent',
  'used',
  'invalid'
);

create table public.gift_card_upload (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references auth.users(id) on delete cascade,
  provider text,
  upload_type gift_card_upload_type not null,
  status gift_card_upload_status not null default 'uploaded',
  file_name text,
  file_size bigint,
  total_cards integer not null default 0,
  processed_cards integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gift_card_asset (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.gift_card_upload(id) on delete cascade,
  assigned_profile_id uuid references public.profile(id) on delete set null,
  value numeric(10, 2) not null,
  asset_url text not null,
  page_count integer,
  source_index integer,
  status gift_card_asset_status not null default 'available',
  sent_at timestamptz,
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (asset_url <> '')
);

create index gift_card_asset_upload_id_idx on public.gift_card_asset(upload_id);
create index gift_card_asset_status_idx on public.gift_card_asset(status);
create index gift_card_upload_status_idx on public.gift_card_upload(status);

create or replace function public.touch_gift_card_upload_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_gift_card_asset_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_gift_card_upload_updated_set_timestamp on public.gift_card_upload;
create trigger on_gift_card_upload_updated_set_timestamp
before update on public.gift_card_upload
for each row execute function public.touch_gift_card_upload_updated_at();

drop trigger if exists on_gift_card_asset_updated_set_timestamp on public.gift_card_asset;
create trigger on_gift_card_asset_updated_set_timestamp
before update on public.gift_card_asset
for each row execute function public.touch_gift_card_asset_updated_at();

alter table public.gift_card_upload enable row level security;
alter table public.gift_card_asset enable row level security;

create policy gift_card_upload_manage_staff
  on public.gift_card_upload
  for all
  using (public.current_user_role() in ('admin', 'manager', 'staff'))
  with check (public.current_user_role() in ('admin', 'manager', 'staff'));

create policy gift_card_asset_manage_staff
  on public.gift_card_asset
  for all
  using (public.current_user_role() in ('admin', 'manager', 'staff'))
  with check (public.current_user_role() in ('admin', 'manager', 'staff'));

create policy gift_card_upload_read_auth_admin
  on public.gift_card_upload
  for select
  to supabase_auth_admin
  using (true);

create policy gift_card_asset_read_auth_admin
  on public.gift_card_asset
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.gift_card_upload to supabase_auth_admin;
grant all on table public.gift_card_asset to supabase_auth_admin;
revoke all on table public.gift_card_upload from authenticated, anon, public;
revoke all on table public.gift_card_asset from authenticated, anon, public;
grant select, insert, update, delete on table public.gift_card_upload to authenticated;
grant select, insert, update, delete on table public.gift_card_asset to authenticated;
grant usage on type gift_card_upload_type to authenticated, supabase_auth_admin;
grant usage on type gift_card_upload_status to authenticated, supabase_auth_admin;
grant usage on type gift_card_asset_status to authenticated, supabase_auth_admin;
