create type public.email_message_status as enum ('queued', 'sent', 'failed', 'skipped');

create table public.email_message (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  template_key text not null,
  template_data jsonb not null default '{}'::jsonb,
  provider text not null default 'resend',
  provider_message_id text,
  status public.email_message_status not null default 'queued',
  error_message text,
  sent_at timestamptz,
  failed_at timestamptz,
  triggered_by_user_id uuid references auth.users (id) on delete set null,
  recipient_user_id uuid references auth.users (id) on delete set null,
  profile_id uuid references public.profile (id) on update cascade on delete set null,
  family_profile_id uuid references public.profile (id) on update cascade on delete set null,
  workshop_enrollment_id uuid references public.workshop_enrollment (id) on update cascade on delete set null,
  event_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index email_message_event_key_to_email_unique
  on public.email_message (event_key, to_email)
  where event_key is not null;

create index email_message_created_at_idx on public.email_message (created_at desc);
create index email_message_to_email_idx on public.email_message (to_email);
create index email_message_workshop_enrollment_idx on public.email_message (workshop_enrollment_id);

create or replace function public.touch_email_message_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_email_message_updated_set_timestamp on public.email_message;
create trigger on_email_message_updated_set_timestamp
before update on public.email_message
for each row execute function public.touch_email_message_updated_at();

alter table public.email_message enable row level security;

create policy email_message_read_authorized
  on public.email_message
  for select
  using (public.authorize('profiles.read'));

create policy email_message_read_self
  on public.email_message
  for select
  using (
    recipient_user_id = auth.uid()
    or lower(to_email) = lower(coalesce(auth.email(), ''))
  );

create policy email_message_read_auth_admin
  on public.email_message
  for select
  to supabase_auth_admin
  using (true);

grant usage on type public.email_message_status to authenticated, supabase_auth_admin;

grant all on table public.email_message to supabase_auth_admin;
revoke all on table public.email_message from authenticated, anon, public;
grant select on table public.email_message to authenticated;
