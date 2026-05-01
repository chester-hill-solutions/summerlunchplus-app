-- Track invites and required auth metadata.
create type public.invite_status as enum ('pending', 'confirmed', 'revoked');

alter table public.profile
  add column if not exists password_set boolean not null default false;

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid references auth.users(id) on delete set null,
  invitee_email text not null,
  role public.app_role not null,
  status public.invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create unique index if not exists invites_invitee_email_key
  on public.invites (invitee_email);

alter table public.invites enable row level security;

create policy invites_read_auth_admin
  on public.invites
  for select
  to supabase_auth_admin
  using (true);

create policy invites_insert_auth_admin
  on public.invites
  for insert
  to supabase_auth_admin
  with check (true);

create policy invites_update_auth_admin
  on public.invites
  for update
  to supabase_auth_admin
  using (true)
  with check (true);

create policy invites_read_self
  on public.invites
  for select
  using (
    inviter_user_id = auth.uid()
    or invitee_user_id = auth.uid()
    or invitee_email = auth.email()
    or public.current_user_role() in ('manager'::public.app_role, 'admin'::public.app_role)
  );

create policy invites_update_self
  on public.invites
  for update
  using (inviter_user_id = auth.uid() or invitee_email = auth.email())
  with check (inviter_user_id = auth.uid() or invitee_email = auth.email());

grant all on table public.invites to supabase_auth_admin;
revoke all on table public.invites from authenticated, anon, public;
grant select, update on table public.invites to authenticated;
