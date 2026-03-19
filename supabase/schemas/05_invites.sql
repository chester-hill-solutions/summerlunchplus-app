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
