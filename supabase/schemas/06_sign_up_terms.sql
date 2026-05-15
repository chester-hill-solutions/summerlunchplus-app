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
  'Summerlunch+ Data Privacy Principles for Children''s Nutrition Education Programs',
  $$Purpose

At Summerlunch+, we are committed to protecting the privacy, safety, and dignity of children
and their families. These principles guide how we handle data in our nutrition education
programs while supporting responsible program delivery and evaluation.

1. Child-Centered Best Interests

We ensure that all data practices prioritize the best interests of the child. We only collect and
use data in ways that support children’s learning, health, and well-being, and avoid any
practices that could harm or stigmatize them.

2. Data Minimization and Purpose Limitation

We only collect data that is directly relevant and necessary for clearly defined educational and
evaluation purposes. We do not collect sensitive personal information unless it is essential and
justified, and we do not use data beyond its original purpose without renewed consent.

3. Informed Consent and Assent

We only collect data after obtaining informed consent from parents or legal guardians, along
with age-appropriate assent from children. We provide clear, accessible explanations of what
data is collected, why it is needed, how it will be used, and with whom it may be shared.

4. Transparency and Accountability

We are transparent about our data practices and provide plain-language privacy information to
families. We maintain clear accountability through designated data stewards and documented
data governance policies.

5. Privacy by Design and Default

We build privacy protections into our programs from the outset. By default, we only collect and
retain the minimum amount of personal data necessary, ensuring that information is not shared
unless required and authorized.

6. De-identification and Anonymization

We only collect identifiable data when necessary. Whenever possible, we use aggregated or
de-identified data for analysis, reporting, and knowledge sharing to reduce the risk of
re-identification.

7. Limited Retention and Secure Disposal

We only collect data for as long as necessary to fulfill program purposes or legal obligations.
We establish clear timelines for secure deletion or anonymization of personal data.

8. Third-Party Safeguards

We do not share data. We prohibit unauthorized data sharing or commercial use of children’s
data.

9. Rights of Access and Correction

We respect the rights of parents and guardians to access, review, and request corrections or
deletion of their child’s data, in accordance with applicable laws.

Implementation Commitment

At Summerlunch+, we commit to ongoing staff training, regular review of our data practices, and
continuous improvement to ensure we uphold the highest standards of children’s data privacy.$$,
  3,
  true
)
on conflict (slug) do nothing;
