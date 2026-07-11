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
  'allocated',
  'sent',
  'opened',
  'used',
  'invalid'
);

create type gift_card_provider as enum (
  'PC',
  'Sobeys'
);

create type gift_card_allocation_status as enum (
  'allocated',
  'sent',
  'opened'
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
  provider gift_card_provider not null default 'PC',
  account_number text not null default '',
  pin text not null default '',
  value numeric(10, 2) not null,
  asset_url text not null,
  page_count integer,
  source_index integer,
  status gift_card_asset_status not null default 'available',
  allocated_at timestamptz,
  reminder_sent_at timestamptz,
  opened_at timestamptz,
  opened_count integer not null default 0,
  last_opened_at timestamptz,
  sent_at timestamptz,
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (asset_url <> '')
);

create table public.gift_card_allocation (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class(id) on delete cascade,
  profile_id uuid not null references public.profile(id) on delete cascade,
  class_attendance_id uuid references public.class_attendance(id) on delete set null,
  gift_card_asset_id uuid not null unique references public.gift_card_asset(id) on delete restrict,
  status gift_card_allocation_status not null default 'allocated',
  blocked boolean not null default false,
  blocked_reason text,
  blocked_at timestamptz,
  blocked_by uuid references auth.users(id) on delete set null,
  reminder_event_key text,
  reminder_email_message_id uuid,
  reminder_sent_at timestamptz,
  glr_token_hash text,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, profile_id),
  unique (glr_token_hash)
);

create table public.gift_card_click_event (
  id uuid primary key default gen_random_uuid(),
  gift_card_allocation_id uuid not null references public.gift_card_allocation(id) on delete cascade,
  profile_id uuid references public.profile(id) on delete set null,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.gift_card_inventory_alert_state (
  provider gift_card_provider primary key,
  is_low boolean not null default false,
  last_inventory_count integer not null default 0,
  last_threshold integer not null default 0,
  last_alerted_at timestamptz,
  last_recovered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (last_inventory_count >= 0),
  check (last_threshold >= 0)
);

create index gift_card_asset_upload_id_idx on public.gift_card_asset(upload_id);
create index gift_card_asset_status_idx on public.gift_card_asset(status);
create index gift_card_upload_status_idx on public.gift_card_upload(status);
create index gift_card_allocation_status_idx on public.gift_card_allocation(status);
create index gift_card_allocation_class_profile_idx on public.gift_card_allocation(class_id, profile_id);
create index gift_card_allocation_sent_idx on public.gift_card_allocation(reminder_sent_at);
create index gift_card_allocation_allocated_unsent_idx
  on public.gift_card_allocation(status, reminder_sent_at, id)
  where status = 'allocated' and reminder_sent_at is null;
create index gift_card_click_event_allocation_idx on public.gift_card_click_event(gift_card_allocation_id, created_at desc);
create index gift_card_click_event_profile_idx on public.gift_card_click_event(profile_id, created_at desc);
create index gift_card_inventory_alert_state_is_low_idx on public.gift_card_inventory_alert_state(is_low);

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

create or replace function public.touch_gift_card_allocation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_gift_card_inventory_alert_state_updated_at()
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

drop trigger if exists on_gift_card_allocation_updated_set_timestamp on public.gift_card_allocation;
create trigger on_gift_card_allocation_updated_set_timestamp
before update on public.gift_card_allocation
for each row execute function public.touch_gift_card_allocation_updated_at();

drop trigger if exists on_gift_card_inventory_alert_state_updated_set_timestamp on public.gift_card_inventory_alert_state;
create trigger on_gift_card_inventory_alert_state_updated_set_timestamp
before update on public.gift_card_inventory_alert_state
for each row execute function public.touch_gift_card_inventory_alert_state_updated_at();

alter table public.gift_card_upload enable row level security;
alter table public.gift_card_asset enable row level security;
alter table public.gift_card_allocation enable row level security;
alter table public.gift_card_click_event enable row level security;
alter table public.gift_card_inventory_alert_state enable row level security;

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

create policy gift_card_allocation_manage_staff
  on public.gift_card_allocation
  for all
  using (public.current_user_role() in ('admin', 'manager', 'staff'))
  with check (public.current_user_role() in ('admin', 'manager', 'staff'));

create policy gift_card_click_event_manage_staff
  on public.gift_card_click_event
  for all
  using (public.current_user_role() in ('admin', 'manager', 'staff'))
  with check (public.current_user_role() in ('admin', 'manager', 'staff'));

create policy gift_card_inventory_alert_state_manage_staff
  on public.gift_card_inventory_alert_state
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

create policy gift_card_allocation_read_auth_admin
  on public.gift_card_allocation
  for select
  to supabase_auth_admin
  using (true);

create policy gift_card_click_event_read_auth_admin
  on public.gift_card_click_event
  for select
  to supabase_auth_admin
  using (true);

create policy gift_card_inventory_alert_state_read_auth_admin
  on public.gift_card_inventory_alert_state
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.gift_card_upload to supabase_auth_admin;
grant all on table public.gift_card_asset to supabase_auth_admin;
grant all on table public.gift_card_allocation to supabase_auth_admin;
grant all on table public.gift_card_click_event to supabase_auth_admin;
grant all on table public.gift_card_inventory_alert_state to supabase_auth_admin;
revoke all on table public.gift_card_upload from authenticated, anon, public;
revoke all on table public.gift_card_asset from authenticated, anon, public;
revoke all on table public.gift_card_allocation from authenticated, anon, public;
revoke all on table public.gift_card_click_event from authenticated, anon, public;
revoke all on table public.gift_card_inventory_alert_state from authenticated, anon, public;
grant select, insert, update, delete on table public.gift_card_upload to authenticated;
grant select, insert, update, delete on table public.gift_card_asset to authenticated;
grant select, insert, update, delete on table public.gift_card_allocation to authenticated;
grant select, insert, update, delete on table public.gift_card_click_event to authenticated;
grant select, insert, update, delete on table public.gift_card_inventory_alert_state to authenticated;
grant usage on type gift_card_upload_type to authenticated, supabase_auth_admin;
grant usage on type gift_card_upload_status to authenticated, supabase_auth_admin;
grant usage on type gift_card_asset_status to authenticated, supabase_auth_admin;
grant usage on type gift_card_provider to authenticated, supabase_auth_admin;
grant usage on type gift_card_allocation_status to authenticated, supabase_auth_admin;
