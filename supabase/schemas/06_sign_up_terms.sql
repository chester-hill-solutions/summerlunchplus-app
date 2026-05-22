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
  'Privacy Policy',
  $$At summerlunch+, we are committed to protecting the privacy and personal information of children, families, educators, volunteers, and website visitors. This Privacy Policy explains how we collect, use, store, and protect information through our programs and website.

Information We Collect
We may collect the following types of information:
Parent or guardian names
Email addresses
Phone numbers
Child participant information
Program registration details
Feedback or survey responses

How We Use Information
Operate and manage nutrition education programs
Communicate with families and participants
Improve educational materials and services
Evaluate program effectiveness
Maintain website security and performance
Share program evaluation data with partners and donors

Children’s Privacy
Protecting children’s privacy is a core priority for summerlunch+. We collect children’s personal information only when necessary for program participation and evaluation purposes with appropriate parent or guardian consent.

Consent
Where required, we obtain consent from parents or legal guardians before collecting or using a child’s personal information and or photos shared with us. This is to be completed in our program registration form.

Data Security
We use administrative, technical, and physical safeguards to protect personal information from unauthorized access, disclosure, misuse, or loss. However, no online system can guarantee complete security.

Data Retention
We retain personal information only for as long as necessary to fulfill program, operational, legal, or reporting purposes. Information that is no longer required is securely deleted or anonymized.

Third-Party Links
Our website may contain links to external websites. summerlunch+ is not responsible for the privacy practices or content of third-party websites.

Photo, Media, and User Content
Participants, parents, guardians, educators, or volunteers may choose to upload photos, recipes, or other educational materials through summerlunch+ programs or website activities.

By submitting content, users confirm that:
they have the right and permission to share the content,
the content does not violate the privacy or rights of others,
and the content is appropriate, respectful, and related to summerlunch+ program

Examples of acceptable content may include:
recipe photos
educational activity photos
nutrition projects
or other materials specifically requested by the summerlunch+ team.

summerlunch+ reserves the right to remove any content that is considered inappropriate, unsafe, unrelated to program activities, offensive, or inconsistent with our mission and community standards.

Consent for Photos and Social Media
summerlunch+ will not publicly post or share identifiable photos or videos of children on social media, websites, promotional materials, or public communications unless explicit consent has been provided by a parent or legal guardian through an authorized consent form. Parents and guardians may withdraw media consent at any time by contacting summerlunch+.

Protection of Children’s Images
We take reasonable steps to minimize privacy risks associated with children’s images and media. Whenever possible, we avoid:
sharing full names alongside photos,
sharing sensitive personal information,
or using images in ways that could compromise a child’s safety, dignity, or privacy.

Changes to This Privacy Policy
We may update this Privacy Policy from time to time. Updated versions will be posted on this page with a revised effective date.$$,
  4,
  true
)
on conflict (slug) do nothing;
