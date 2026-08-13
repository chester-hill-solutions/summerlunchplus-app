create table public.post_program_survey_email_event (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.post_program_survey_campaign (id) on delete cascade,
  template_key text not null check (
    template_key in (
      'post_program_survey_initial_v1',
      'post_program_survey_reminder_v1',
      'post_program_survey_gift_card_v1'
    )
  ),
  slot_at timestamptz not null,
  recipient_email text not null,
  due_at timestamptz not null,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  sent_at timestamptz,
  email_message_id uuid references public.email_message (id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, template_key, slot_at, recipient_email),
  check (
    (claimed_at is null and claim_expires_at is null)
    or (claimed_at is not null and claim_expires_at is not null)
  )
);

create index post_program_survey_email_event_due_idx
  on public.post_program_survey_email_event (due_at, id)
  where sent_at is null;

create or replace function public.touch_post_program_survey_email_event_updated_at()
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

create trigger on_post_program_survey_email_event_updated_set_timestamp
before update on public.post_program_survey_email_event
for each row execute function public.touch_post_program_survey_email_event_updated_at();

alter table public.post_program_survey_email_event enable row level security;

create policy post_program_survey_email_event_read_manager
  on public.post_program_survey_email_event
  for select
  using (public.authorize('post_program_survey.manage'));

create policy post_program_survey_email_event_read_auth_admin
  on public.post_program_survey_email_event
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.post_program_survey_email_event to supabase_auth_admin;
revoke all on table public.post_program_survey_email_event from authenticated, anon, public;
grant select on table public.post_program_survey_email_event to authenticated;

create or replace function public.claim_post_program_survey_email_events(
  p_now timestamptz,
  p_limit integer default 100
)
returns table (
  id uuid,
  campaign_id uuid,
  template_key text,
  recipient_email text,
  slot_at timestamptz,
  attempt_count integer
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select event.id
    from public.post_program_survey_email_event as event
    join public.post_program_survey_campaign as campaign on campaign.id = event.campaign_id
    where event.sent_at is null
      and campaign.completed_at is null
      and event.due_at <= p_now
      and coalesce(event.next_attempt_at, event.due_at) <= p_now
      and (event.claim_expires_at is null or event.claim_expires_at <= p_now)
    order by event.due_at, event.id
    limit greatest(1, least(p_limit, 500))
    for update of event skip locked
  ), claimed as (
    update public.post_program_survey_email_event as event
    set
      claimed_at = p_now,
      claim_expires_at = p_now + interval '15 minutes',
      attempt_count = event.attempt_count + 1,
      last_error = null
    from candidates
    where event.id = candidates.id
    returning event.id, event.campaign_id, event.template_key, event.recipient_email, event.slot_at, event.attempt_count
  )
  select * from claimed;
$$;

create or replace function public.complete_post_program_survey_email_event(
  p_event_id uuid,
  p_email_message_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.post_program_survey_email_event
    set
      sent_at = now(),
      email_message_id = p_email_message_id,
      claimed_at = null,
      claim_expires_at = null,
      next_attempt_at = null,
      last_error = null
    where id = p_event_id
      and sent_at is null
      and claimed_at is not null
    returning id
  )
  select exists (select 1 from updated);
$$;

create or replace function public.fail_post_program_survey_email_event(
  p_event_id uuid,
  p_error text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.post_program_survey_email_event
    set
      claimed_at = null,
      claim_expires_at = null,
      next_attempt_at = now() + make_interval(mins => least(240, 15 * greatest(1, attempt_count))),
      last_error = left(coalesce(p_error, 'Unknown email failure'), 1000)
    where id = p_event_id
      and sent_at is null
    returning id
  )
  select exists (select 1 from updated);
$$;

revoke all on function public.claim_post_program_survey_email_events(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.complete_post_program_survey_email_event(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_post_program_survey_email_event(uuid, text) from public, anon, authenticated;

grant execute on function public.claim_post_program_survey_email_events(timestamptz, integer) to service_role;
grant execute on function public.complete_post_program_survey_email_event(uuid, uuid) to service_role;
grant execute on function public.fail_post_program_survey_email_event(uuid, text) to service_role;
