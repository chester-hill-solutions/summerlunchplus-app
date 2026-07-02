alter table public.class_attendance
  add column if not exists gift_card_blocked boolean not null default false,
  add column if not exists gift_card_block_reason text,
  add column if not exists gift_card_blocked_at timestamptz,
  add column if not exists gift_card_blocked_by uuid references auth.users(id) on delete set null;

alter type public.gift_card_asset_status rename to gift_card_asset_status__old_version_to_be_dropped;

create type public.gift_card_asset_status as enum (
  'available',
  'allocated',
  'sent',
  'opened',
  'used',
  'invalid'
);

alter table public.gift_card_asset alter column status drop default;
alter table public.gift_card_asset
  alter column status type public.gift_card_asset_status
  using status::text::public.gift_card_asset_status;
alter table public.gift_card_asset alter column status set default 'available'::public.gift_card_asset_status;

drop type public.gift_card_asset_status__old_version_to_be_dropped;

create type public.gift_card_provider as enum ('PC', 'Sobeys');

alter table public.gift_card_asset
  add column if not exists provider public.gift_card_provider,
  add column if not exists account_number text,
  add column if not exists pin text,
  add column if not exists allocated_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists opened_count integer not null default 0,
  add column if not exists last_opened_at timestamptz;

update public.gift_card_asset
set provider = case
    when (metadata->>'provider') = 'Sobeys' then 'Sobeys'::public.gift_card_provider
    when (metadata->>'provider') = 'PC' then 'PC'::public.gift_card_provider
    else 'PC'::public.gift_card_provider
  end
where provider is null;

alter table public.gift_card_asset
  alter column provider set not null,
  alter column provider set default 'PC'::public.gift_card_provider;

alter table public.gift_card_asset
  alter column account_number set not null,
  alter column account_number set default '',
  alter column pin set not null,
  alter column pin set default '';

create type public.gift_card_allocation_status as enum ('allocated', 'sent', 'opened');

create table public.gift_card_allocation (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class(id) on delete cascade,
  profile_id uuid not null references public.profile(id) on delete cascade,
  class_attendance_id uuid references public.class_attendance(id) on delete set null,
  gift_card_asset_id uuid not null unique references public.gift_card_asset(id) on delete restrict,
  status public.gift_card_allocation_status not null default 'allocated',
  blocked boolean not null default false,
  blocked_reason text,
  blocked_at timestamptz,
  blocked_by uuid references auth.users(id) on delete set null,
  reminder_event_key text,
  reminder_email_message_id uuid references public.email_message(id) on delete set null,
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

create index gift_card_allocation_status_idx on public.gift_card_allocation(status);
create index gift_card_allocation_class_profile_idx on public.gift_card_allocation(class_id, profile_id);
create index gift_card_allocation_sent_idx on public.gift_card_allocation(reminder_sent_at);

create table public.gift_card_click_event (
  id uuid primary key default gen_random_uuid(),
  gift_card_allocation_id uuid not null references public.gift_card_allocation(id) on delete cascade,
  profile_id uuid references public.profile(id) on delete set null,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index gift_card_click_event_allocation_idx
  on public.gift_card_click_event(gift_card_allocation_id, created_at desc);

create index gift_card_click_event_profile_idx
  on public.gift_card_click_event(profile_id, created_at desc);

create or replace function public.touch_gift_card_allocation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_gift_card_allocation_updated_set_timestamp on public.gift_card_allocation;
create trigger on_gift_card_allocation_updated_set_timestamp
before update on public.gift_card_allocation
for each row execute function public.touch_gift_card_allocation_updated_at();

alter table public.gift_card_allocation enable row level security;
alter table public.gift_card_click_event enable row level security;

create policy gift_card_allocation_manage_staff
  on public.gift_card_allocation
  for all
  using (public.current_user_role() in ('admin', 'manager', 'staff'))
  with check (public.current_user_role() in ('admin', 'manager', 'staff'));

create policy gift_card_allocation_read_auth_admin
  on public.gift_card_allocation
  for select
  to supabase_auth_admin
  using (true);

create policy gift_card_click_event_manage_staff
  on public.gift_card_click_event
  for all
  using (public.current_user_role() in ('admin', 'manager', 'staff'))
  with check (public.current_user_role() in ('admin', 'manager', 'staff'));

create policy gift_card_click_event_read_auth_admin
  on public.gift_card_click_event
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.gift_card_allocation to supabase_auth_admin;
grant all on table public.gift_card_click_event to supabase_auth_admin;
revoke all on table public.gift_card_allocation from authenticated, anon, public;
revoke all on table public.gift_card_click_event from authenticated, anon, public;
grant select, insert, update, delete on table public.gift_card_allocation to authenticated;
grant select, insert, update, delete on table public.gift_card_click_event to authenticated;

grant usage on type public.gift_card_provider to authenticated, supabase_auth_admin;
grant usage on type public.gift_card_allocation_status to authenticated, supabase_auth_admin;
grant usage on type public.gift_card_asset_status to authenticated, supabase_auth_admin;
