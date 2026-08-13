revoke delete on table "public"."post_program_survey_email_event" from "anon";

revoke insert on table "public"."post_program_survey_email_event" from "anon";

revoke references on table "public"."post_program_survey_email_event" from "anon";

revoke select on table "public"."post_program_survey_email_event" from "anon";

revoke trigger on table "public"."post_program_survey_email_event" from "anon";

revoke truncate on table "public"."post_program_survey_email_event" from "anon";

revoke update on table "public"."post_program_survey_email_event" from "anon";

revoke delete on table "public"."post_program_survey_email_event" from "authenticated";

revoke insert on table "public"."post_program_survey_email_event" from "authenticated";

revoke references on table "public"."post_program_survey_email_event" from "authenticated";

revoke trigger on table "public"."post_program_survey_email_event" from "authenticated";

revoke truncate on table "public"."post_program_survey_email_event" from "authenticated";

revoke update on table "public"."post_program_survey_email_event" from "authenticated";

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
  v_completed_at timestamptz;
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
  returning public.post_program_survey_campaign.completed_at into v_completed_at;

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

  return query select v_campaign.id, true, v_submission_id, v_completed_at;
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
  v_completed_at timestamptz;
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
  returning public.post_program_survey_campaign.completed_at into v_completed_at;

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

  return query select v_campaign.id, v_completed_at;
end;
$function$
;
