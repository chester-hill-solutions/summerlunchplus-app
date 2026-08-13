/*
create type "public"."app_permissions" as enum ('site.read', 'form.create', 'form.read', 'form.update', 'form.delete', 'form_question.create', 'form_question.read', 'form_question.update', 'form_question.delete', 'form_question_map.create', 'form_question_map.read', 'form_question_map.update', 'form_question_map.delete', 'form_assignment.create', 'form_assignment.read', 'form_assignment.update', 'form_assignment.delete', 'form_submission.create', 'form_submission.read', 'form_submission.update', 'form_submission.delete', 'form_answer.create', 'form_answer.read', 'form_answer.update', 'form_answer.delete', 'semester.create', 'semester.read', 'semester.update', 'semester.delete', 'workshop.create', 'workshop.read', 'workshop.update', 'workshop.delete', 'workshop_enrollment.create', 'workshop_enrollment.read', 'workshop_enrollment.update', 'workshop_enrollment.update_status', 'class_attendance.create', 'class_attendance.read', 'class_attendance.update', 'class_attendance.delete', 'user_roles.manage', 'role_permission.manage', 'profiles.read', 'profiles.update', 'zoom_host.create', 'zoom_host.read', 'zoom_host.update', 'zoom_host.delete', 'class_zoom_meeting.create', 'class_zoom_meeting.read', 'class_zoom_meeting.update', 'class_zoom_meeting.delete', 'class_zoom_registrant.create', 'class_zoom_registrant.read', 'class_zoom_registrant.update', 'class_zoom_registrant.delete', 'class_zoom_participant_sync.create', 'class_zoom_participant_sync.read', 'class_zoom_participant_sync.update', 'class_zoom_participant_sync.delete', 'class_zoom_participant.create', 'class_zoom_participant.read', 'class_zoom_participant.update', 'class_zoom_participant.delete', 'zlr_click_event.create', 'zlr_click_event.read', 'zlr_click_event.update', 'zlr_click_event.delete', 'class_attendance_photo.create', 'class_attendance_photo.read', 'class_attendance_photo.update', 'class_attendance_photo.delete', 'class_attendance_photo_upload_attempt.create', 'class_attendance_photo_upload_attempt.read', 'class_attendance_photo_upload_attempt.update', 'class_attendance_photo_upload_attempt.delete', 'post_program_survey.manage');


*/
  create table "public"."post_program_survey_campaign" (
    "id" uuid not null default gen_random_uuid(),
    "semester_id" uuid not null,
    "form_id" uuid not null,
    "family_anchor_profile_id" uuid not null,
    "survey_profile_id" uuid not null,
    "available_at" timestamp with time zone not null,
    "initial_sent_at" timestamp with time zone,
    "last_normal_reminder_on" date,
    "completed_at" timestamp with time zone,
    "completed_submission_id" uuid,
    "manually_completed_at" timestamp with time zone,
    "manually_completed_by_user_id" uuid,
    "manual_completion_reason" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."post_program_survey_campaign" enable row level security;


  create table "public"."post_program_survey_campaign_audit" (
    "id" uuid not null default gen_random_uuid(),
    "campaign_id" uuid not null,
    "event_type" text not null,
    "actor_user_id" uuid,
    "actor_role" text,
    "source" text not null,
    "details" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."post_program_survey_campaign_audit" enable row level security;


  create table "public"."post_program_survey_campaign_enrollment" (
    "campaign_id" uuid not null,
    "workshop_enrollment_id" uuid not null,
    "gift_card_notice_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."post_program_survey_campaign_enrollment" enable row level security;


  create table "public"."post_program_survey_campaign_member" (
    "campaign_id" uuid not null,
    "profile_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."post_program_survey_campaign_member" enable row level security;

CREATE INDEX post_program_survey_campaign_audit_campaign_created_idx ON public.post_program_survey_campaign_audit USING btree (campaign_id, created_at DESC);

CREATE UNIQUE INDEX post_program_survey_campaign_audit_pkey ON public.post_program_survey_campaign_audit USING btree (id);

CREATE UNIQUE INDEX post_program_survey_campaign_completed_submission_id_key ON public.post_program_survey_campaign USING btree (completed_submission_id);

CREATE UNIQUE INDEX post_program_survey_campaign_enrollm_workshop_enrollment_id_key ON public.post_program_survey_campaign_enrollment USING btree (workshop_enrollment_id);

CREATE INDEX post_program_survey_campaign_enrollment_campaign_idx ON public.post_program_survey_campaign_enrollment USING btree (campaign_id);

CREATE UNIQUE INDEX post_program_survey_campaign_enrollment_pkey ON public.post_program_survey_campaign_enrollment USING btree (campaign_id, workshop_enrollment_id);

CREATE UNIQUE INDEX post_program_survey_campaign_member_pkey ON public.post_program_survey_campaign_member USING btree (campaign_id, profile_id);

CREATE INDEX post_program_survey_campaign_member_profile_idx ON public.post_program_survey_campaign_member USING btree (profile_id, campaign_id);

CREATE INDEX post_program_survey_campaign_open_idx ON public.post_program_survey_campaign USING btree (available_at, id) WHERE (completed_at IS NULL);

CREATE UNIQUE INDEX post_program_survey_campaign_pkey ON public.post_program_survey_campaign USING btree (id);

CREATE UNIQUE INDEX post_program_survey_campaign_semester_id_family_anchor_prof_key ON public.post_program_survey_campaign USING btree (semester_id, family_anchor_profile_id);

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_pkey" PRIMARY KEY using index "post_program_survey_campaign_pkey";

alter table "public"."post_program_survey_campaign_audit" add constraint "post_program_survey_campaign_audit_pkey" PRIMARY KEY using index "post_program_survey_campaign_audit_pkey";

alter table "public"."post_program_survey_campaign_enrollment" add constraint "post_program_survey_campaign_enrollment_pkey" PRIMARY KEY using index "post_program_survey_campaign_enrollment_pkey";

alter table "public"."post_program_survey_campaign_member" add constraint "post_program_survey_campaign_member_pkey" PRIMARY KEY using index "post_program_survey_campaign_member_pkey";

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_check" CHECK ((((completed_submission_id IS NULL) AND (manually_completed_at IS NULL)) OR ((completed_submission_id IS NOT NULL) AND (manually_completed_at IS NULL)) OR ((completed_submission_id IS NULL) AND (manually_completed_at IS NOT NULL) AND (manually_completed_by_user_id IS NOT NULL) AND (NULLIF(btrim(manual_completion_reason), ''::text) IS NOT NULL)))) not valid;

alter table "public"."post_program_survey_campaign" validate constraint "post_program_survey_campaign_check";

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_check1" CHECK (((completed_at IS NULL) OR (completed_submission_id IS NOT NULL) OR (manually_completed_at IS NOT NULL))) not valid;

alter table "public"."post_program_survey_campaign" validate constraint "post_program_survey_campaign_check1";

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_completed_submission_id_fkey" FOREIGN KEY (completed_submission_id) REFERENCES public.form_submission(id) ON DELETE RESTRICT not valid;

alter table "public"."post_program_survey_campaign" validate constraint "post_program_survey_campaign_completed_submission_id_fkey";

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_completed_submission_id_key" UNIQUE using index "post_program_survey_campaign_completed_submission_id_key";

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_family_anchor_profile_id_fkey" FOREIGN KEY (family_anchor_profile_id) REFERENCES public.profile(id) ON DELETE RESTRICT not valid;

alter table "public"."post_program_survey_campaign" validate constraint "post_program_survey_campaign_family_anchor_profile_id_fkey";

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.form(id) ON DELETE RESTRICT not valid;

alter table "public"."post_program_survey_campaign" validate constraint "post_program_survey_campaign_form_id_fkey";

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_manually_completed_by_user_id_fkey" FOREIGN KEY (manually_completed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."post_program_survey_campaign" validate constraint "post_program_survey_campaign_manually_completed_by_user_id_fkey";

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_semester_id_family_anchor_prof_key" UNIQUE using index "post_program_survey_campaign_semester_id_family_anchor_prof_key";

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semester(id) ON DELETE RESTRICT not valid;

alter table "public"."post_program_survey_campaign" validate constraint "post_program_survey_campaign_semester_id_fkey";

alter table "public"."post_program_survey_campaign" add constraint "post_program_survey_campaign_survey_profile_id_fkey" FOREIGN KEY (survey_profile_id) REFERENCES public.profile(id) ON DELETE RESTRICT not valid;

alter table "public"."post_program_survey_campaign" validate constraint "post_program_survey_campaign_survey_profile_id_fkey";

alter table "public"."post_program_survey_campaign_audit" add constraint "post_program_survey_campaign_audit_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."post_program_survey_campaign_audit" validate constraint "post_program_survey_campaign_audit_actor_user_id_fkey";

alter table "public"."post_program_survey_campaign_audit" add constraint "post_program_survey_campaign_audit_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.post_program_survey_campaign(id) ON DELETE RESTRICT not valid;

alter table "public"."post_program_survey_campaign_audit" validate constraint "post_program_survey_campaign_audit_campaign_id_fkey";

alter table "public"."post_program_survey_campaign_audit" add constraint "post_program_survey_campaign_audit_event_type_check" CHECK ((event_type = ANY (ARRAY['created'::text, 'completed_submission'::text, 'completed_manual'::text]))) not valid;

alter table "public"."post_program_survey_campaign_audit" validate constraint "post_program_survey_campaign_audit_event_type_check";

alter table "public"."post_program_survey_campaign_audit" add constraint "post_program_survey_campaign_audit_source_check" CHECK ((source = ANY (ARRAY['user'::text, 'staff'::text, 'automation'::text]))) not valid;

alter table "public"."post_program_survey_campaign_audit" validate constraint "post_program_survey_campaign_audit_source_check";

alter table "public"."post_program_survey_campaign_enrollment" add constraint "post_program_survey_campaign_enroll_workshop_enrollment_id_fkey" FOREIGN KEY (workshop_enrollment_id) REFERENCES public.workshop_enrollment(id) ON DELETE RESTRICT not valid;

alter table "public"."post_program_survey_campaign_enrollment" validate constraint "post_program_survey_campaign_enroll_workshop_enrollment_id_fkey";

alter table "public"."post_program_survey_campaign_enrollment" add constraint "post_program_survey_campaign_enrollm_workshop_enrollment_id_key" UNIQUE using index "post_program_survey_campaign_enrollm_workshop_enrollment_id_key";

alter table "public"."post_program_survey_campaign_enrollment" add constraint "post_program_survey_campaign_enrollment_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.post_program_survey_campaign(id) ON DELETE CASCADE not valid;

alter table "public"."post_program_survey_campaign_enrollment" validate constraint "post_program_survey_campaign_enrollment_campaign_id_fkey";

alter table "public"."post_program_survey_campaign_member" add constraint "post_program_survey_campaign_member_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.post_program_survey_campaign(id) ON DELETE CASCADE not valid;

alter table "public"."post_program_survey_campaign_member" validate constraint "post_program_survey_campaign_member_campaign_id_fkey";

alter table "public"."post_program_survey_campaign_member" add constraint "post_program_survey_campaign_member_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profile(id) ON DELETE RESTRICT not valid;

alter table "public"."post_program_survey_campaign_member" validate constraint "post_program_survey_campaign_member_profile_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.complete_post_program_survey_campaign(p_campaign_id uuid, p_answers jsonb, p_request_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(campaign_id uuid, completed boolean, submission_id uuid, completed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_post_program_survey_campaign(p_semester_id uuid, p_form_id uuid, p_family_anchor_profile_id uuid, p_survey_profile_id uuid, p_member_profile_ids uuid[], p_workshop_enrollment_ids uuid[], p_available_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.manually_complete_post_program_survey_campaign(p_campaign_id uuid, p_reason text)
 RETURNS TABLE(campaign_id uuid, completed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.touch_post_program_survey_campaign_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant select on table "public"."post_program_survey_campaign" to "authenticated";

grant delete on table "public"."post_program_survey_campaign" to "service_role";

grant insert on table "public"."post_program_survey_campaign" to "service_role";

grant references on table "public"."post_program_survey_campaign" to "service_role";

grant select on table "public"."post_program_survey_campaign" to "service_role";

grant trigger on table "public"."post_program_survey_campaign" to "service_role";

grant truncate on table "public"."post_program_survey_campaign" to "service_role";

grant update on table "public"."post_program_survey_campaign" to "service_role";

grant delete on table "public"."post_program_survey_campaign" to "supabase_auth_admin";

grant insert on table "public"."post_program_survey_campaign" to "supabase_auth_admin";

grant references on table "public"."post_program_survey_campaign" to "supabase_auth_admin";

grant select on table "public"."post_program_survey_campaign" to "supabase_auth_admin";

grant trigger on table "public"."post_program_survey_campaign" to "supabase_auth_admin";

grant truncate on table "public"."post_program_survey_campaign" to "supabase_auth_admin";

grant update on table "public"."post_program_survey_campaign" to "supabase_auth_admin";

grant select on table "public"."post_program_survey_campaign_audit" to "authenticated";

grant delete on table "public"."post_program_survey_campaign_audit" to "service_role";

grant insert on table "public"."post_program_survey_campaign_audit" to "service_role";

grant references on table "public"."post_program_survey_campaign_audit" to "service_role";

grant select on table "public"."post_program_survey_campaign_audit" to "service_role";

grant trigger on table "public"."post_program_survey_campaign_audit" to "service_role";

grant truncate on table "public"."post_program_survey_campaign_audit" to "service_role";

grant update on table "public"."post_program_survey_campaign_audit" to "service_role";

grant delete on table "public"."post_program_survey_campaign_audit" to "supabase_auth_admin";

grant insert on table "public"."post_program_survey_campaign_audit" to "supabase_auth_admin";

grant references on table "public"."post_program_survey_campaign_audit" to "supabase_auth_admin";

grant select on table "public"."post_program_survey_campaign_audit" to "supabase_auth_admin";

grant trigger on table "public"."post_program_survey_campaign_audit" to "supabase_auth_admin";

grant truncate on table "public"."post_program_survey_campaign_audit" to "supabase_auth_admin";

grant update on table "public"."post_program_survey_campaign_audit" to "supabase_auth_admin";

grant select on table "public"."post_program_survey_campaign_enrollment" to "authenticated";

grant delete on table "public"."post_program_survey_campaign_enrollment" to "service_role";

grant insert on table "public"."post_program_survey_campaign_enrollment" to "service_role";

grant references on table "public"."post_program_survey_campaign_enrollment" to "service_role";

grant select on table "public"."post_program_survey_campaign_enrollment" to "service_role";

grant trigger on table "public"."post_program_survey_campaign_enrollment" to "service_role";

grant truncate on table "public"."post_program_survey_campaign_enrollment" to "service_role";

grant update on table "public"."post_program_survey_campaign_enrollment" to "service_role";

grant delete on table "public"."post_program_survey_campaign_enrollment" to "supabase_auth_admin";

grant insert on table "public"."post_program_survey_campaign_enrollment" to "supabase_auth_admin";

grant references on table "public"."post_program_survey_campaign_enrollment" to "supabase_auth_admin";

grant select on table "public"."post_program_survey_campaign_enrollment" to "supabase_auth_admin";

grant trigger on table "public"."post_program_survey_campaign_enrollment" to "supabase_auth_admin";

grant truncate on table "public"."post_program_survey_campaign_enrollment" to "supabase_auth_admin";

grant update on table "public"."post_program_survey_campaign_enrollment" to "supabase_auth_admin";

grant select on table "public"."post_program_survey_campaign_member" to "authenticated";

grant delete on table "public"."post_program_survey_campaign_member" to "service_role";

grant insert on table "public"."post_program_survey_campaign_member" to "service_role";

grant references on table "public"."post_program_survey_campaign_member" to "service_role";

grant select on table "public"."post_program_survey_campaign_member" to "service_role";

grant trigger on table "public"."post_program_survey_campaign_member" to "service_role";

grant truncate on table "public"."post_program_survey_campaign_member" to "service_role";

grant update on table "public"."post_program_survey_campaign_member" to "service_role";

grant delete on table "public"."post_program_survey_campaign_member" to "supabase_auth_admin";

grant insert on table "public"."post_program_survey_campaign_member" to "supabase_auth_admin";

grant references on table "public"."post_program_survey_campaign_member" to "supabase_auth_admin";

grant select on table "public"."post_program_survey_campaign_member" to "supabase_auth_admin";

grant trigger on table "public"."post_program_survey_campaign_member" to "supabase_auth_admin";

grant truncate on table "public"."post_program_survey_campaign_member" to "supabase_auth_admin";

grant update on table "public"."post_program_survey_campaign_member" to "supabase_auth_admin";


  create policy "post_program_survey_campaign_read_auth_admin"
  on "public"."post_program_survey_campaign"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "post_program_survey_campaign_read_manager"
  on "public"."post_program_survey_campaign"
  as permissive
  for select
  to public
using (public.authorize('post_program_survey.manage'::public.app_permissions));



  create policy "post_program_survey_campaign_read_member"
  on "public"."post_program_survey_campaign"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.post_program_survey_campaign_member member
  WHERE ((member.campaign_id = post_program_survey_campaign.id) AND (member.profile_id = public.current_profile_id())))));



  create policy "post_program_survey_campaign_audit_read_auth_admin"
  on "public"."post_program_survey_campaign_audit"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "post_program_survey_campaign_audit_read_manager"
  on "public"."post_program_survey_campaign_audit"
  as permissive
  for select
  to public
using (public.authorize('post_program_survey.manage'::public.app_permissions));



  create policy "post_program_survey_campaign_enrollment_read_auth_admin"
  on "public"."post_program_survey_campaign_enrollment"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "post_program_survey_campaign_enrollment_read_manager"
  on "public"."post_program_survey_campaign_enrollment"
  as permissive
  for select
  to public
using (public.authorize('post_program_survey.manage'::public.app_permissions));



  create policy "post_program_survey_campaign_enrollment_read_member"
  on "public"."post_program_survey_campaign_enrollment"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.post_program_survey_campaign_member member
  WHERE ((member.campaign_id = post_program_survey_campaign_enrollment.campaign_id) AND (member.profile_id = public.current_profile_id())))));



  create policy "post_program_survey_campaign_member_read_auth_admin"
  on "public"."post_program_survey_campaign_member"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "post_program_survey_campaign_member_read_manager"
  on "public"."post_program_survey_campaign_member"
  as permissive
  for select
  to public
using (public.authorize('post_program_survey.manage'::public.app_permissions));



  create policy "post_program_survey_campaign_member_read_member"
  on "public"."post_program_survey_campaign_member"
  as permissive
  for select
  to public
using ((profile_id = public.current_profile_id()));


CREATE TRIGGER on_post_program_survey_campaign_updated_set_timestamp BEFORE UPDATE ON public.post_program_survey_campaign FOR EACH ROW EXECUTE FUNCTION public.touch_post_program_survey_campaign_updated_at();

insert into public.role_permission (role, permission)
values
  ('admin'::public.app_role, 'post_program_survey.manage'::public.app_permissions),
  ('manager'::public.app_role, 'post_program_survey.manage'::public.app_permissions)
on conflict do nothing;

revoke all on function public.ensure_post_program_survey_campaign(uuid, uuid, uuid, uuid, uuid[], uuid[], timestamptz) from public, anon, authenticated;
revoke all on function public.complete_post_program_survey_campaign(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.manually_complete_post_program_survey_campaign(uuid, text) from public, anon;

grant execute on function public.ensure_post_program_survey_campaign(uuid, uuid, uuid, uuid, uuid[], uuid[], timestamptz) to service_role;
grant execute on function public.complete_post_program_survey_campaign(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.manually_complete_post_program_survey_campaign(uuid, text) to authenticated;
