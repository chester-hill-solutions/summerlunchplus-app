alter table public.form_submission
  add column if not exists ip_classification text not null default 'unknown',
  add column if not exists ip_confidence_level text not null default 'unknown',
  add column if not exists ip_reason_codes jsonb not null default '[]'::jsonb,
  add column if not exists ip_reason_text text,
  add column if not exists ip_classifier_version integer not null default 1,
  add column if not exists proxy_provider_match text,
  add column if not exists proxy_match_cidr cidr;

create index if not exists form_submission_ip_classification_idx
  on public.form_submission (ip_classification, ip_confidence_level);

alter table public.login_event
  add column if not exists ip_classification text not null default 'unknown',
  add column if not exists ip_confidence_level text not null default 'unknown',
  add column if not exists ip_reason_codes jsonb not null default '[]'::jsonb,
  add column if not exists ip_reason_text text,
  add column if not exists ip_classifier_version integer not null default 1,
  add column if not exists proxy_provider_match text,
  add column if not exists proxy_match_cidr cidr;

create index if not exists login_event_ip_classification_idx
  on public.login_event (ip_classification, ip_confidence_level);
