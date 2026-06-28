create table public.login_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  login_method text not null,
  success boolean not null default true,
  ip_address inet,
  ip_selected inet,
  ip_selected_source text,
  ip_chain jsonb not null default '[]'::jsonb,
  ip_parse_version integer not null default 1,
  ip_parse_confidence text not null default 'unknown',
  ip_parse_notes jsonb not null default '{}'::jsonb,
  ip_classification text not null default 'unknown',
  ip_confidence_level text not null default 'unknown',
  ip_reason_codes jsonb not null default '[]'::jsonb,
  ip_reason_text text,
  ip_classifier_version integer not null default 1,
  proxy_provider_match text,
  proxy_match_cidr cidr,
  forwarded_for text,
  user_agent text,
  accept_language text,
  referer text,
  origin text,
  request_headers jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now()
);

create index login_event_event_at_idx on public.login_event (event_at desc);
create index login_event_user_event_at_idx on public.login_event (user_id, event_at desc);
create index login_event_ip_address_idx on public.login_event (ip_address);
create index login_event_ip_selected_idx on public.login_event (ip_selected);
create index login_event_ip_classification_idx on public.login_event (ip_classification, ip_confidence_level);

alter table public.login_event enable row level security;

create policy login_event_read_authorized
  on public.login_event
  for select
  using (public.authorize('profiles.read'));

create policy login_event_insert_self
  on public.login_event
  for insert
  with check (user_id = auth.uid());

create policy login_event_read_auth_admin
  on public.login_event
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.login_event to supabase_auth_admin;
revoke all on table public.login_event from authenticated, anon, public;
grant select, insert on table public.login_event to authenticated;
