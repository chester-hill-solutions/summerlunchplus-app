create table public.post_program_survey_campaign (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semester (id) on delete restrict,
  form_id uuid not null references public.form (id) on delete restrict,
  family_anchor_profile_id uuid not null references public.profile (id) on delete restrict,
  survey_profile_id uuid not null references public.profile (id) on delete restrict,
  available_at timestamptz not null,
  initial_sent_at timestamptz,
  last_normal_reminder_on date,
  completed_at timestamptz,
  completed_submission_id uuid unique references public.form_submission (id) on delete restrict,
  manually_completed_at timestamptz,
  manually_completed_by_user_id uuid references auth.users (id) on delete set null,
  manual_completion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, family_anchor_profile_id),
  check (
    (completed_submission_id is null and manually_completed_at is null)
    or (completed_submission_id is not null and manually_completed_at is null)
    or (
      completed_submission_id is null
      and manually_completed_at is not null
      and manually_completed_by_user_id is not null
      and nullif(btrim(manual_completion_reason), '') is not null
    )
  ),
  check (
    completed_at is null
    or completed_submission_id is not null
    or manually_completed_at is not null
  )
);

create table public.post_program_survey_campaign_member (
  campaign_id uuid not null references public.post_program_survey_campaign (id) on delete cascade,
  profile_id uuid not null references public.profile (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (campaign_id, profile_id)
);

create table public.post_program_survey_campaign_enrollment (
  campaign_id uuid not null references public.post_program_survey_campaign (id) on delete cascade,
  workshop_enrollment_id uuid not null references public.workshop_enrollment (id) on delete restrict,
  gift_card_notice_sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (campaign_id, workshop_enrollment_id),
  unique (workshop_enrollment_id)
);

create table public.post_program_survey_campaign_audit (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.post_program_survey_campaign (id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_role text,
  source text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (event_type in ('created', 'completed_submission', 'completed_manual')),
  check (source in ('user', 'staff', 'automation'))
);

create index post_program_survey_campaign_open_idx
  on public.post_program_survey_campaign (available_at, id)
  where completed_at is null;

create index post_program_survey_campaign_member_profile_idx
  on public.post_program_survey_campaign_member (profile_id, campaign_id);

create index post_program_survey_campaign_enrollment_campaign_idx
  on public.post_program_survey_campaign_enrollment (campaign_id);

create index post_program_survey_campaign_audit_campaign_created_idx
  on public.post_program_survey_campaign_audit (campaign_id, created_at desc);

create or replace function public.touch_post_program_survey_campaign_updated_at()
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

create trigger on_post_program_survey_campaign_updated_set_timestamp
before update on public.post_program_survey_campaign
for each row execute function public.touch_post_program_survey_campaign_updated_at();

alter table public.post_program_survey_campaign enable row level security;
alter table public.post_program_survey_campaign_member enable row level security;
alter table public.post_program_survey_campaign_enrollment enable row level security;
alter table public.post_program_survey_campaign_audit enable row level security;

create policy post_program_survey_campaign_read_member
  on public.post_program_survey_campaign
  for select
  using (
    exists (
      select 1
      from public.post_program_survey_campaign_member as member
      where member.campaign_id = post_program_survey_campaign.id
        and member.profile_id = public.current_profile_id()
    )
  );

create policy post_program_survey_campaign_read_manager
  on public.post_program_survey_campaign
  for select
  using (public.authorize('post_program_survey.manage'));

create policy post_program_survey_campaign_member_read_member
  on public.post_program_survey_campaign_member
  for select
  using (profile_id = public.current_profile_id());

create policy post_program_survey_campaign_member_read_manager
  on public.post_program_survey_campaign_member
  for select
  using (public.authorize('post_program_survey.manage'));

create policy post_program_survey_campaign_enrollment_read_member
  on public.post_program_survey_campaign_enrollment
  for select
  using (
    exists (
      select 1
      from public.post_program_survey_campaign_member as member
      where member.campaign_id = post_program_survey_campaign_enrollment.campaign_id
        and member.profile_id = public.current_profile_id()
    )
  );

create policy post_program_survey_campaign_enrollment_read_manager
  on public.post_program_survey_campaign_enrollment
  for select
  using (public.authorize('post_program_survey.manage'));

create policy post_program_survey_campaign_audit_read_manager
  on public.post_program_survey_campaign_audit
  for select
  using (public.authorize('post_program_survey.manage'));

create policy post_program_survey_campaign_read_auth_admin
  on public.post_program_survey_campaign
  for select
  to supabase_auth_admin
  using (true);

create policy post_program_survey_campaign_member_read_auth_admin
  on public.post_program_survey_campaign_member
  for select
  to supabase_auth_admin
  using (true);

create policy post_program_survey_campaign_enrollment_read_auth_admin
  on public.post_program_survey_campaign_enrollment
  for select
  to supabase_auth_admin
  using (true);

create policy post_program_survey_campaign_audit_read_auth_admin
  on public.post_program_survey_campaign_audit
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.post_program_survey_campaign to supabase_auth_admin;
grant all on table public.post_program_survey_campaign_member to supabase_auth_admin;
grant all on table public.post_program_survey_campaign_enrollment to supabase_auth_admin;
grant all on table public.post_program_survey_campaign_audit to supabase_auth_admin;

revoke all on table public.post_program_survey_campaign from authenticated, anon, public;
revoke all on table public.post_program_survey_campaign_member from authenticated, anon, public;
revoke all on table public.post_program_survey_campaign_enrollment from authenticated, anon, public;
revoke all on table public.post_program_survey_campaign_audit from authenticated, anon, public;

grant select on table public.post_program_survey_campaign to authenticated;
grant select on table public.post_program_survey_campaign_member to authenticated;
grant select on table public.post_program_survey_campaign_enrollment to authenticated;
grant select on table public.post_program_survey_campaign_audit to authenticated;

create or replace function public.ensure_post_program_survey_campaign(
  p_semester_id uuid,
  p_form_id uuid,
  p_family_anchor_profile_id uuid,
  p_survey_profile_id uuid,
  p_member_profile_ids uuid[],
  p_workshop_enrollment_ids uuid[],
  p_available_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_active_form_id uuid;
  v_member_count integer;
  v_enrollment_count integer;
begin
  if coalesce(array_length(p_member_profile_ids, 1), 0) = 0 then
    raise exception 'Campaign members are required';
  end if;

  if coalesce(array_length(p_workshop_enrollment_ids, 1), 0) = 0 then
    raise exception 'Campaign enrollments are required';
  end if;

  select requirement.form_id
    into v_active_form_id
  from public.semester_form_requirement as requirement
  where requirement.semester_id = p_semester_id
    and requirement.form_id = p_form_id
    and requirement.is_active = true
    and requirement.kind::text in ('post_survey', 'post_program_survey')
  limit 1;

  if v_active_form_id is null then
    raise exception 'Form % is not the active post-program survey for semester %', p_form_id, p_semester_id;
  end if;

  select count(*)
    into v_member_count
  from (
    select distinct member_id
    from unnest(p_member_profile_ids) as member_id
  ) as members
  join public.profile as profile on profile.id = members.member_id;

  if v_member_count <> cardinality(array(select distinct member_id from unnest(p_member_profile_ids) as member_id))
     or not (p_family_anchor_profile_id = any(p_member_profile_ids))
     or not (p_survey_profile_id = any(p_member_profile_ids)) then
    raise exception 'Campaign members must include valid anchor and survey profiles';
  end if;

  select count(*)
    into v_enrollment_count
  from public.workshop_enrollment as enrollment
  where enrollment.id = any(p_workshop_enrollment_ids)
    and enrollment.semester_id = p_semester_id
    and enrollment.status = 'approved'
    and enrollment.profile_id = any(p_member_profile_ids);

  if v_enrollment_count <> cardinality(array(select distinct enrollment_id from unnest(p_workshop_enrollment_ids) as enrollment_id)) then
    raise exception 'Campaign enrollments must be approved members of the selected semester';
  end if;

  insert into public.post_program_survey_campaign (
    semester_id,
    form_id,
    family_anchor_profile_id,
    survey_profile_id,
    available_at
  )
  values (
    p_semester_id,
    p_form_id,
    p_family_anchor_profile_id,
    p_survey_profile_id,
    p_available_at
  )
  on conflict (semester_id, family_anchor_profile_id) do nothing
  returning id into v_campaign_id;

  if v_campaign_id is null then
    select id
      into v_campaign_id
    from public.post_program_survey_campaign
    where semester_id = p_semester_id
      and family_anchor_profile_id = p_family_anchor_profile_id
    for update;
  else
    insert into public.post_program_survey_campaign_audit (
      campaign_id,
      event_type,
      source,
      details
    )
    values (
      v_campaign_id,
      'created',
      'automation',
      jsonb_build_object('available_at', p_available_at)
    );
  end if;

  insert into public.post_program_survey_campaign_member (campaign_id, profile_id)
  select v_campaign_id, member_id
  from (
    select distinct member_id
    from unnest(p_member_profile_ids) as member_id
  ) as members
  on conflict do nothing;

  insert into public.post_program_survey_campaign_enrollment (
    campaign_id,
    workshop_enrollment_id
  )
  select v_campaign_id, enrollment_id
  from (
    select distinct enrollment_id
    from unnest(p_workshop_enrollment_ids) as enrollment_id
  ) as enrollments
  on conflict do nothing;

  return v_campaign_id;
end;
$$;

create or replace function public.complete_post_program_survey_campaign(
  p_campaign_id uuid,
  p_answers jsonb,
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  campaign_id uuid,
  completed boolean,
  submission_id uuid,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.post_program_survey_campaign%rowtype;
  v_actor_profile_id uuid;
  v_submission_id uuid;
  v_question record;
  v_value jsonb;
  v_option text;
begin
  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answers must be an object';
  end if;

  select *
    into v_campaign
  from public.post_program_survey_campaign
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Campaign not found';
  end if;

  v_actor_profile_id := public.current_profile_id();
  if v_actor_profile_id is null
     or not exists (
       select 1
       from public.post_program_survey_campaign_member as member
       where member.campaign_id = v_campaign.id
         and member.profile_id = v_actor_profile_id
     ) then
    raise exception 'Campaign access denied';
  end if;

  if v_campaign.completed_at is not null then
    return query select v_campaign.id, true, v_campaign.completed_submission_id, v_campaign.completed_at;
    return;
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_answers) as answer(question_code)
    where not exists (
      select 1
      from public.form_question_map as map
      where map.form_id = v_campaign.form_id
        and map.question_code = answer.question_code
    )
  ) then
    raise exception 'Answers contain an unknown question';
  end if;

  for v_question in
    select
      map.question_code,
      coalesce(map.options_override, question.options) as options,
      question.type,
      coalesce((map.metadata ->> 'optional')::boolean, false) as optional
    from public.form_question_map as map
    join public.form_question as question on question.question_code = map.question_code
    where map.form_id = v_campaign.form_id
    order by map.position
  loop
    v_value := p_answers -> v_question.question_code;

    if not v_question.optional
       and v_question.type <> 'no-input-text'
       and (
         v_value is null
         or v_value = 'null'::jsonb
         or (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '')
         or (jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) = 0)
       ) then
      raise exception 'Question % is required', v_question.question_code;
    end if;

    if v_value is null or v_value = 'null'::jsonb then
      continue;
    end if;

    if v_question.type in ('text', 'date', 'address', 'agreement') and jsonb_typeof(v_value) <> 'string' then
      raise exception 'Question % requires a string answer', v_question.question_code;
    end if;

    if v_question.type = 'number' and jsonb_typeof(v_value) <> 'number' then
      raise exception 'Question % requires a numeric answer', v_question.question_code;
    end if;

    if v_question.type = 'checkbox' and jsonb_typeof(v_value) <> 'boolean' then
      raise exception 'Question % requires a boolean answer', v_question.question_code;
    end if;

    if v_question.type = 'single_choice' then
      if jsonb_typeof(v_value) <> 'string'
         or not (v_question.options @> jsonb_build_array(v_value)) then
        raise exception 'Question % has an invalid option', v_question.question_code;
      end if;
    end if;

    if v_question.type = 'multi_choice' then
      if jsonb_typeof(v_value) <> 'array' then
        raise exception 'Question % requires an array answer', v_question.question_code;
      end if;

      for v_option in select jsonb_array_elements_text(v_value)
      loop
        if not (v_question.options @> jsonb_build_array(to_jsonb(v_option))) then
          raise exception 'Question % has an invalid option', v_question.question_code;
        end if;
      end loop;
    end if;
  end loop;

  insert into public.form_submission (
    form_id,
    profile_id,
    user_id,
    metadata
  )
  values (
    v_campaign.form_id,
    v_campaign.survey_profile_id,
    auth.uid(),
    jsonb_build_object(
      'source', 'semester_post_program_survey',
      'campaign_id', v_campaign.id,
      'respondent_profile_id', v_actor_profile_id,
      'request', p_request_metadata
    )
  )
  returning id into v_submission_id;

  insert into public.form_answer (submission_id, question_code, value)
  select v_submission_id, answer.question_code, answer.value
  from jsonb_each(p_answers) as answer(question_code, value)
  join public.form_question_map as map
    on map.form_id = v_campaign.form_id
   and map.question_code = answer.question_code
  where answer.value <> 'null'::jsonb;

  update public.post_program_survey_campaign
  set completed_submission_id = v_submission_id,
      completed_at = now()
  where id = v_campaign.id
  returning completed_at into completed_at;

  insert into public.post_program_survey_campaign_audit (
    campaign_id,
    event_type,
    actor_user_id,
    source,
    details
  )
  values (
    v_campaign.id,
    'completed_submission',
    auth.uid(),
    'user',
    jsonb_build_object('submission_id', v_submission_id, 'respondent_profile_id', v_actor_profile_id)
  );

  return query select v_campaign.id, true, v_submission_id, completed_at;
end;
$$;

create or replace function public.manually_complete_post_program_survey_campaign(
  p_campaign_id uuid,
  p_reason text
)
returns table (
  campaign_id uuid,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.post_program_survey_campaign%rowtype;
begin
  if not public.authorize('post_program_survey.manage') then
    raise exception 'Campaign management access denied';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A completion reason is required';
  end if;

  select *
    into v_campaign
  from public.post_program_survey_campaign
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Campaign not found';
  end if;

  if v_campaign.completed_at is not null then
    return query select v_campaign.id, v_campaign.completed_at;
    return;
  end if;

  update public.post_program_survey_campaign
  set completed_at = now(),
      manually_completed_at = now(),
      manually_completed_by_user_id = auth.uid(),
      manual_completion_reason = btrim(p_reason)
  where id = v_campaign.id
  returning completed_at into completed_at;

  insert into public.post_program_survey_campaign_audit (
    campaign_id,
    event_type,
    actor_user_id,
    actor_role,
    source,
    details
  )
  values (
    v_campaign.id,
    'completed_manual',
    auth.uid(),
    public.current_user_role()::text,
    'staff',
    jsonb_build_object('reason', btrim(p_reason))
  );

  return query select v_campaign.id, completed_at;
end;
$$;

revoke all on function public.ensure_post_program_survey_campaign(uuid, uuid, uuid, uuid, uuid[], uuid[], timestamptz) from public, anon, authenticated;
revoke all on function public.complete_post_program_survey_campaign(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.manually_complete_post_program_survey_campaign(uuid, text) from public, anon;

grant execute on function public.ensure_post_program_survey_campaign(uuid, uuid, uuid, uuid, uuid[], uuid[], timestamptz) to service_role;
grant execute on function public.complete_post_program_survey_campaign(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.manually_complete_post_program_survey_campaign(uuid, text) to authenticated;
