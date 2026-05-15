-- Signup terms content and consent snapshots.
create table if not exists public.sign_up_terms (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  content text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);

create unique index if not exists sign_up_terms_single_active
  on public.sign_up_terms (is_active)
  where is_active = true;

create table if not exists public.sign_up_terms_consent (
  id uuid primary key default gen_random_uuid(),
  sign_up_terms_id uuid not null references public.sign_up_terms(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  profile_id uuid references public.profile(id) on delete set null,
  email text not null,
  role app_role not null,
  terms_version integer not null,
  terms_content text not null,
  accepted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists sign_up_terms_consent_user_idx
  on public.sign_up_terms_consent (user_id, accepted_at desc);

create index if not exists sign_up_terms_consent_profile_idx
  on public.sign_up_terms_consent (profile_id, accepted_at desc);

create index if not exists sign_up_terms_consent_email_idx
  on public.sign_up_terms_consent (email);

create or replace function public.touch_sign_up_terms_updated_at()
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

drop trigger if exists on_sign_up_terms_updated_set_timestamp on public.sign_up_terms;
create trigger on_sign_up_terms_updated_set_timestamp
before update on public.sign_up_terms
for each row execute function public.touch_sign_up_terms_updated_at();

alter table public.sign_up_terms enable row level security;
alter table public.sign_up_terms_consent enable row level security;

create policy sign_up_terms_read_active_public
  on public.sign_up_terms
  for select
  using (is_active = true);

create policy sign_up_terms_read_authorized
  on public.sign_up_terms
  for select
  using (public.authorize('form.read'));

create policy sign_up_terms_insert_authorized
  on public.sign_up_terms
  for insert
  with check (public.authorize('form.update'));

create policy sign_up_terms_update_authorized
  on public.sign_up_terms
  for update
  using (public.authorize('form.update'))
  with check (public.authorize('form.update'));

create policy sign_up_terms_delete_authorized
  on public.sign_up_terms
  for delete
  using (public.authorize('form.update'));

create policy sign_up_terms_read_auth_admin
  on public.sign_up_terms
  for select
  to supabase_auth_admin
  using (true);

create policy sign_up_terms_insert_auth_admin
  on public.sign_up_terms
  for insert
  to supabase_auth_admin
  with check (true);

create policy sign_up_terms_update_auth_admin
  on public.sign_up_terms
  for update
  to supabase_auth_admin
  using (true)
  with check (true);

create policy sign_up_terms_delete_auth_admin
  on public.sign_up_terms
  for delete
  to supabase_auth_admin
  using (true);

create policy sign_up_terms_consent_read_authorized
  on public.sign_up_terms_consent
  for select
  using (public.authorize('form.read'));

create policy sign_up_terms_consent_read_self
  on public.sign_up_terms_consent
  for select
  using (user_id = auth.uid());

create policy sign_up_terms_consent_insert_self
  on public.sign_up_terms_consent
  for insert
  with check (user_id = auth.uid());

create policy sign_up_terms_consent_read_auth_admin
  on public.sign_up_terms_consent
  for select
  to supabase_auth_admin
  using (true);

create policy sign_up_terms_consent_insert_auth_admin
  on public.sign_up_terms_consent
  for insert
  to supabase_auth_admin
  with check (true);

grant all on table public.sign_up_terms to supabase_auth_admin;
grant all on table public.sign_up_terms_consent to supabase_auth_admin;

revoke all on table public.sign_up_terms from authenticated, anon, public;
revoke all on table public.sign_up_terms_consent from authenticated, anon, public;

grant select on table public.sign_up_terms to authenticated, anon;
grant insert, update, delete on table public.sign_up_terms to authenticated;
grant select, insert on table public.sign_up_terms_consent to authenticated;

insert into public.sign_up_terms (slug, title, content, version, is_active)
values (
  'default',
  'Summerlunch+ Terms and Consent',
  $$By creating a Summerlunch+ account, you agree that your information is used to run and improve the Summerlunch+ program, coordinate enrollment, communicate program updates, and support participant safety.\n\nYou confirm that the information you provide is accurate, that you are authorized to submit it, and that you understand this information may be reviewed by Summerlunch+ staff for program operations and support.\n\nIf you sign up as a guardian, you acknowledge responsibility for participant supervision and program expectations during live sessions. If you sign up as a student, you confirm you have permission to participate and provide the requested information.\n\nBy selecting \"I have read and agree to these terms\", you consent to these terms and acknowledge this acceptance is recorded with a timestamp.$$,
  1,
  true
)
on conflict (slug) do nothing;
