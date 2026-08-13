revoke delete on table "public"."post_program_survey_campaign" from "anon";

revoke insert on table "public"."post_program_survey_campaign" from "anon";

revoke references on table "public"."post_program_survey_campaign" from "anon";

revoke select on table "public"."post_program_survey_campaign" from "anon";

revoke trigger on table "public"."post_program_survey_campaign" from "anon";

revoke truncate on table "public"."post_program_survey_campaign" from "anon";

revoke update on table "public"."post_program_survey_campaign" from "anon";

revoke delete on table "public"."post_program_survey_campaign" from "authenticated";

revoke insert on table "public"."post_program_survey_campaign" from "authenticated";

revoke references on table "public"."post_program_survey_campaign" from "authenticated";

revoke trigger on table "public"."post_program_survey_campaign" from "authenticated";

revoke truncate on table "public"."post_program_survey_campaign" from "authenticated";

revoke update on table "public"."post_program_survey_campaign" from "authenticated";

revoke delete on table "public"."post_program_survey_campaign_audit" from "anon";

revoke insert on table "public"."post_program_survey_campaign_audit" from "anon";

revoke references on table "public"."post_program_survey_campaign_audit" from "anon";

revoke select on table "public"."post_program_survey_campaign_audit" from "anon";

revoke trigger on table "public"."post_program_survey_campaign_audit" from "anon";

revoke truncate on table "public"."post_program_survey_campaign_audit" from "anon";

revoke update on table "public"."post_program_survey_campaign_audit" from "anon";

revoke delete on table "public"."post_program_survey_campaign_audit" from "authenticated";

revoke insert on table "public"."post_program_survey_campaign_audit" from "authenticated";

revoke references on table "public"."post_program_survey_campaign_audit" from "authenticated";

revoke trigger on table "public"."post_program_survey_campaign_audit" from "authenticated";

revoke truncate on table "public"."post_program_survey_campaign_audit" from "authenticated";

revoke update on table "public"."post_program_survey_campaign_audit" from "authenticated";

revoke delete on table "public"."post_program_survey_campaign_enrollment" from "anon";

revoke insert on table "public"."post_program_survey_campaign_enrollment" from "anon";

revoke references on table "public"."post_program_survey_campaign_enrollment" from "anon";

revoke select on table "public"."post_program_survey_campaign_enrollment" from "anon";

revoke trigger on table "public"."post_program_survey_campaign_enrollment" from "anon";

revoke truncate on table "public"."post_program_survey_campaign_enrollment" from "anon";

revoke update on table "public"."post_program_survey_campaign_enrollment" from "anon";

revoke delete on table "public"."post_program_survey_campaign_enrollment" from "authenticated";

revoke insert on table "public"."post_program_survey_campaign_enrollment" from "authenticated";

revoke references on table "public"."post_program_survey_campaign_enrollment" from "authenticated";

revoke trigger on table "public"."post_program_survey_campaign_enrollment" from "authenticated";

revoke truncate on table "public"."post_program_survey_campaign_enrollment" from "authenticated";

revoke update on table "public"."post_program_survey_campaign_enrollment" from "authenticated";

revoke delete on table "public"."post_program_survey_campaign_member" from "anon";

revoke insert on table "public"."post_program_survey_campaign_member" from "anon";

revoke references on table "public"."post_program_survey_campaign_member" from "anon";

revoke select on table "public"."post_program_survey_campaign_member" from "anon";

revoke trigger on table "public"."post_program_survey_campaign_member" from "anon";

revoke truncate on table "public"."post_program_survey_campaign_member" from "anon";

revoke update on table "public"."post_program_survey_campaign_member" from "anon";

revoke delete on table "public"."post_program_survey_campaign_member" from "authenticated";

revoke insert on table "public"."post_program_survey_campaign_member" from "authenticated";

revoke references on table "public"."post_program_survey_campaign_member" from "authenticated";

revoke trigger on table "public"."post_program_survey_campaign_member" from "authenticated";

revoke truncate on table "public"."post_program_survey_campaign_member" from "authenticated";

revoke update on table "public"."post_program_survey_campaign_member" from "authenticated";


  create table "public"."post_program_survey_email_event" (
    "id" uuid not null default gen_random_uuid(),
    "campaign_id" uuid not null,
    "template_key" text not null,
    "slot_at" timestamp with time zone not null,
    "recipient_email" text not null,
    "due_at" timestamp with time zone not null,
    "claimed_at" timestamp with time zone,
    "claim_expires_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "email_message_id" uuid,
    "attempt_count" integer not null default 0,
    "next_attempt_at" timestamp with time zone,
    "last_error" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."post_program_survey_email_event" enable row level security;

CREATE UNIQUE INDEX post_program_survey_email_eve_campaign_id_template_key_slot_key ON public.post_program_survey_email_event USING btree (campaign_id, template_key, slot_at, recipient_email);

CREATE INDEX post_program_survey_email_event_due_idx ON public.post_program_survey_email_event USING btree (due_at, id) WHERE (sent_at IS NULL);

CREATE UNIQUE INDEX post_program_survey_email_event_pkey ON public.post_program_survey_email_event USING btree (id);

alter table "public"."post_program_survey_email_event" add constraint "post_program_survey_email_event_pkey" PRIMARY KEY using index "post_program_survey_email_event_pkey";

alter table "public"."post_program_survey_email_event" add constraint "post_program_survey_email_eve_campaign_id_template_key_slot_key" UNIQUE using index "post_program_survey_email_eve_campaign_id_template_key_slot_key";

alter table "public"."post_program_survey_email_event" add constraint "post_program_survey_email_event_attempt_count_check" CHECK ((attempt_count >= 0)) not valid;

alter table "public"."post_program_survey_email_event" validate constraint "post_program_survey_email_event_attempt_count_check";

alter table "public"."post_program_survey_email_event" add constraint "post_program_survey_email_event_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.post_program_survey_campaign(id) ON DELETE CASCADE not valid;

alter table "public"."post_program_survey_email_event" validate constraint "post_program_survey_email_event_campaign_id_fkey";

alter table "public"."post_program_survey_email_event" add constraint "post_program_survey_email_event_check" CHECK ((((claimed_at IS NULL) AND (claim_expires_at IS NULL)) OR ((claimed_at IS NOT NULL) AND (claim_expires_at IS NOT NULL)))) not valid;

alter table "public"."post_program_survey_email_event" validate constraint "post_program_survey_email_event_check";

alter table "public"."post_program_survey_email_event" add constraint "post_program_survey_email_event_email_message_id_fkey" FOREIGN KEY (email_message_id) REFERENCES public.email_message(id) ON DELETE SET NULL not valid;

alter table "public"."post_program_survey_email_event" validate constraint "post_program_survey_email_event_email_message_id_fkey";

alter table "public"."post_program_survey_email_event" add constraint "post_program_survey_email_event_template_key_check" CHECK ((template_key = ANY (ARRAY['post_program_survey_initial_v1'::text, 'post_program_survey_reminder_v1'::text, 'post_program_survey_gift_card_v1'::text]))) not valid;

alter table "public"."post_program_survey_email_event" validate constraint "post_program_survey_email_event_template_key_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.claim_post_program_survey_email_events(p_now timestamp with time zone, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, campaign_id uuid, template_key text, recipient_email text, slot_at timestamp with time zone, attempt_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.complete_post_program_survey_email_event(p_event_id uuid, p_email_message_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_post_program_survey_email_draft(p_draft_key text, p_title text, p_description text, p_trigger_summary text, p_subject text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_draft_id uuid;
  v_version_id uuid;
begin
  insert into public.email_draft (
    draft_key,
    title,
    description,
    trigger_summary,
    trigger_event_key,
    trigger_owner,
    channel,
    status,
    is_system,
    variables_schema,
    current_subject_markdown,
    current_body_markdown
  )
  values (
    p_draft_key,
    p_title,
    p_description,
    p_trigger_summary,
    'post_program_survey.email',
    'web/app/lib/post-program-survey/runner.server.ts',
    'transactional',
    'draft',
    true,
    '{"required": ["recipientName", "surveyUrl"]}'::jsonb,
    p_subject,
    p_body
  )
  on conflict (draft_key)
  do update
    set
      title = excluded.title,
      description = excluded.description,
      trigger_summary = excluded.trigger_summary,
      trigger_event_key = excluded.trigger_event_key,
      trigger_owner = excluded.trigger_owner,
      channel = excluded.channel,
      is_system = true,
      variables_schema = case
        when public.email_draft.variables_schema = '{}'::jsonb then excluded.variables_schema
        else public.email_draft.variables_schema
      end,
      current_subject_markdown = case
        when char_length(btrim(public.email_draft.current_subject_markdown)) = 0 then excluded.current_subject_markdown
        else public.email_draft.current_subject_markdown
      end,
      current_body_markdown = case
        when char_length(btrim(public.email_draft.current_body_markdown)) = 0 then excluded.current_body_markdown
        else public.email_draft.current_body_markdown
      end
  returning id into v_draft_id;

  insert into public.email_draft_version (
    email_draft_id,
    version_number,
    subject_markdown,
    body_markdown,
    subject_rendered,
    html_rendered,
    text_rendered,
    variables_schema,
    change_note,
    published_at
  )
  values (
    v_draft_id,
    1,
    p_subject,
    p_body,
    p_subject,
    replace(replace(p_body, E'\n', '<br />'), '{{surveyUrl}}', '<a href="{{surveyUrl}}">Complete the post-program survey</a>'),
    p_body,
    '{"required": ["recipientName", "surveyUrl"]}'::jsonb,
    'Seeded post-program survey email draft.',
    now()
  )
  on conflict (email_draft_id, version_number) do nothing;

  if exists (
    select 1
    from public.email_draft
    where id = v_draft_id
      and published_version_id is null
  ) then
    select version.id
      into v_version_id
    from public.email_draft_version as version
    where version.email_draft_id = v_draft_id
    order by version.version_number desc
    limit 1;

    update public.email_draft
    set
      published_version_id = v_version_id,
      status = 'published'
    where id = v_draft_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_post_program_survey_gift_card_email_draft()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.ensure_post_program_survey_email_draft(
    'post_program_survey_gift_card_v1',
    'Post-program survey gift-card reminder',
    'Gift-card reminder for a family that has not completed its post-program survey.',
    'Sent August 25, August 27, September 1, and September 3, 2026 at 9 PM Toronto time to incomplete campaign guardians.',
    'Complete your survey to receive your final grocery gift card',
    E'Hi {{recipientName}},\n\nIt looks like you have still not completed your summerlunch+ post-program evaluation.\n\nPlease complete the survey as soon as possible. To receive your final Week 8 grocery gift card, you must complete the post-program evaluation.\n\nComplete the survey: {{surveyUrl}}\n\nThe summerlunch+ Team'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_post_program_survey_initial_email_draft()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.ensure_post_program_survey_email_draft(
    'post_program_survey_initial_v1',
    'Post-program survey initial request',
    'Initial request for a family to complete its post-program survey.',
    'Sent August 14, 2026 at 9 AM Toronto time to incomplete campaign guardians.',
    'Please complete your summerlunch+ post-program evaluation',
    E'Hi {{recipientName}},\n\nThank you for participating in the summerlunch+ program!\n\nJust as you completed the pre-program questions when you registered, we now have our post-program evaluation for you to complete.\n\nPlease complete the survey: {{surveyUrl}}\n\nThe summerlunch+ Team'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_post_program_survey_reminder_email_draft()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.ensure_post_program_survey_email_draft(
    'post_program_survey_reminder_v1',
    'Post-program survey reminder',
    'Regular reminder for a family to complete its post-program survey.',
    'Sent August 18 and August 20, 2026 at 9 PM Toronto time to incomplete campaign guardians.',
    'Reminder: complete your summerlunch+ post-program evaluation',
    E'Hi {{recipientName}},\n\nThis is a quick reminder to complete your summerlunch+ post-program evaluation if you have not already done so.\n\nIt only takes a few minutes, and your feedback is very important to us.\n\nComplete the survey: {{surveyUrl}}\n\nThe summerlunch+ Team'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.fail_post_program_survey_email_event(p_event_id uuid, p_error text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.touch_post_program_survey_email_event_updated_at()
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

grant select on table "public"."post_program_survey_email_event" to "authenticated";

grant delete on table "public"."post_program_survey_email_event" to "service_role";

grant insert on table "public"."post_program_survey_email_event" to "service_role";

grant references on table "public"."post_program_survey_email_event" to "service_role";

grant select on table "public"."post_program_survey_email_event" to "service_role";

grant trigger on table "public"."post_program_survey_email_event" to "service_role";

grant truncate on table "public"."post_program_survey_email_event" to "service_role";

grant update on table "public"."post_program_survey_email_event" to "service_role";

grant delete on table "public"."post_program_survey_email_event" to "supabase_auth_admin";

grant insert on table "public"."post_program_survey_email_event" to "supabase_auth_admin";

grant references on table "public"."post_program_survey_email_event" to "supabase_auth_admin";

grant select on table "public"."post_program_survey_email_event" to "supabase_auth_admin";

grant trigger on table "public"."post_program_survey_email_event" to "supabase_auth_admin";

grant truncate on table "public"."post_program_survey_email_event" to "supabase_auth_admin";

grant update on table "public"."post_program_survey_email_event" to "supabase_auth_admin";


  create policy "post_program_survey_email_event_read_auth_admin"
  on "public"."post_program_survey_email_event"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "post_program_survey_email_event_read_manager"
  on "public"."post_program_survey_email_event"
  as permissive
  for select
  to public
using (public.authorize('post_program_survey.manage'::public.app_permissions));


CREATE TRIGGER on_post_program_survey_email_event_updated_set_timestamp BEFORE UPDATE ON public.post_program_survey_email_event FOR EACH ROW EXECUTE FUNCTION public.touch_post_program_survey_email_event_updated_at();

revoke all on function public.claim_post_program_survey_email_events(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.complete_post_program_survey_email_event(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_post_program_survey_email_event(uuid, text) from public, anon, authenticated;

grant execute on function public.claim_post_program_survey_email_events(timestamptz, integer) to service_role;
grant execute on function public.complete_post_program_survey_email_event(uuid, uuid) to service_role;
grant execute on function public.fail_post_program_survey_email_event(uuid, text) to service_role;

select public.ensure_post_program_survey_initial_email_draft();
select public.ensure_post_program_survey_reminder_email_draft();
select public.ensure_post_program_survey_gift_card_email_draft();
