-- Cross-table scenario coverage with a compact dataset.
-- Covers form submissions/answers, login events, and email message states.

with selected_forms as (
  select
    (
      select id
      from public.form
      where name = 'Profile Information'
      order by id desc
      limit 1
    ) as profile_form_id,
    (
      select id
      from public.form
      where name = 'Guardian Consent'
      order by id desc
      limit 1
    ) as consent_form_id,
    (
      select id
      from public.form
      where name like 'Pre-Semester Survey - %'
      order by name asc
      limit 1
    ) as pre_survey_form_id
), submission_rows as (
  select
    '10000000-0000-0000-0000-000000000001'::uuid as id,
    profile_form_id as form_id,
    '11111111-aaaa-aaaa-aaaa-111111111111'::uuid as profile_id,
    null::uuid as user_id,
    '198.51.100.11'::inet as ip_address,
    '198.51.100.11'::text as forwarded_for,
    'seed-browser/1.0'::text as user_agent,
    'en-CA'::text as accept_language,
    'https://example.local/sign-up'::text as referer,
    'https://example.local'::text as origin,
    now() - interval '5 days' as submitted_at,
    '{"seed":true,"scenario":"profile-information-complete"}'::jsonb as metadata
  from selected_forms

  union all

  select
    '10000000-0000-0000-0000-000000000002'::uuid,
    consent_form_id,
    '11111111-aaaa-aaaa-aaaa-111111111111'::uuid,
    null::uuid,
    '198.51.100.11'::inet,
    '198.51.100.11'::text,
    'seed-browser/1.0'::text,
    'en-CA'::text,
    'https://example.local/sign-up'::text,
    'https://example.local'::text,
    now() - interval '4 days',
    '{"seed":true,"scenario":"consent-submitted"}'::jsonb
  from selected_forms

  union all

  select
    '10000000-0000-0000-0000-000000000003'::uuid,
    pre_survey_form_id,
    '22222222-bbbb-bbbb-bbbb-222222222222'::uuid,
    null::uuid,
    '203.0.113.12'::inet,
    '203.0.113.12'::text,
    'seed-browser/1.0'::text,
    'en-CA'::text,
    'https://example.local/enroll'::text,
    'https://example.local'::text,
    now() - interval '3 days',
    '{"seed":true,"scenario":"pre-survey-submitted"}'::jsonb
  from selected_forms
)
insert into public.form_submission (
  id,
  form_id,
  profile_id,
  user_id,
  ip_address,
  forwarded_for,
  user_agent,
  accept_language,
  referer,
  origin,
  submitted_at,
  metadata
)
select
  id,
  form_id,
  profile_id,
  user_id,
  ip_address,
  forwarded_for,
  user_agent,
  accept_language,
  referer,
  origin,
  submitted_at,
  metadata
from submission_rows
where form_id is not null
on conflict (id) do update
  set form_id = excluded.form_id,
      profile_id = excluded.profile_id,
      ip_address = excluded.ip_address,
      forwarded_for = excluded.forwarded_for,
      user_agent = excluded.user_agent,
      accept_language = excluded.accept_language,
      referer = excluded.referer,
      origin = excluded.origin,
      submitted_at = excluded.submitted_at,
      metadata = excluded.metadata;

with answer_rows as (
  select * from (
    values
      ('20000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'guardian_self_firstname'::text, '"Amina"'::jsonb),
      ('20000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'guardian_consent_privacy'::text, 'true'::jsonb),
      ('20000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000003'::uuid, 'pre_skill_follow_recipe'::text, '"Agree"'::jsonb)
  ) as seed(id, submission_id, question_code, value)
)
insert into public.form_answer (id, submission_id, question_code, value)
select seed.id, seed.submission_id, seed.question_code, seed.value
from answer_rows seed
join public.form_submission fs on fs.id = seed.submission_id
join public.form_question fq on fq.question_code = seed.question_code
on conflict (id) do update
  set value = excluded.value;

insert into public.login_event (
  id,
  user_id,
  email,
  login_method,
  success,
  ip_address,
  forwarded_for,
  user_agent,
  accept_language,
  referer,
  origin,
  metadata,
  event_at
)
values
  (
    '30000000-0000-0000-0000-000000000001'::uuid,
    null,
    'guardian1@chsolutions.ca',
    'password',
    true,
    '198.51.100.11'::inet,
    '198.51.100.11',
    'seed-browser/1.0',
    'en-CA',
    'https://example.local/login',
    'https://example.local',
    '{"seed":true,"scenario":"successful-login"}'::jsonb,
    now() - interval '2 days'
  ),
  (
    '30000000-0000-0000-0000-000000000002'::uuid,
    null,
    'seed.guardian.discrepancy@chsolutions.ca',
    'password',
    false,
    '203.0.113.200'::inet,
    '203.0.113.200',
    'seed-browser/1.0',
    'en-US',
    'https://example.local/login',
    'https://example.local',
    '{"seed":true,"scenario":"failed-login"}'::jsonb,
    now() - interval '1 day'
  )
on conflict (id) do update
  set email = excluded.email,
      login_method = excluded.login_method,
      success = excluded.success,
      ip_address = excluded.ip_address,
      forwarded_for = excluded.forwarded_for,
      user_agent = excluded.user_agent,
      accept_language = excluded.accept_language,
      referer = excluded.referer,
      origin = excluded.origin,
      metadata = excluded.metadata,
      event_at = excluded.event_at;

insert into public.email_message (
  id,
  to_email,
  subject,
  template_key,
  template_data,
  provider,
  provider_message_id,
  status,
  error_message,
  sent_at,
  failed_at,
  triggered_by_user_id,
  recipient_user_id,
  profile_id,
  family_profile_id,
  workshop_enrollment_id,
  event_key
)
values
  (
    '40000000-0000-0000-0000-000000000001'::uuid,
    'guardian1@chsolutions.ca',
    'Enrollment request received',
    'family_enrollment_pending_v1',
    '{"workshopName":"Current Session A - Enrollment Triage"}'::jsonb,
    'resend',
    null,
    'queued',
    null,
    null,
    null,
    null,
    null,
    '11111111-aaaa-aaaa-aaaa-111111111111'::uuid,
    '11111111-aaaa-aaaa-aaaa-111111111111'::uuid,
    null,
    'seed:email:queued:1'
  ),
  (
    '40000000-0000-0000-0000-000000000002'::uuid,
    'guardian1@chsolutions.ca',
    'Enrollment approved',
    'family_enrollment_accepted_v1',
    '{"workshopName":"Current Session A - Enrollment Triage"}'::jsonb,
    'resend',
    'resend-seed-accepted-1',
    'sent',
    null,
    now() - interval '12 hours',
    null,
    null,
    null,
    '22222222-bbbb-bbbb-bbbb-222222222222'::uuid,
    '11111111-aaaa-aaaa-aaaa-111111111111'::uuid,
    null,
    'seed:email:sent:1'
  ),
  (
    '40000000-0000-0000-0000-000000000003'::uuid,
    'seed.guardian.discrepancy@chsolutions.ca',
    'Suspicious activity detected',
    'security_alert_v1',
    '{"signal":"network_distance_anomaly"}'::jsonb,
    'resend',
    null,
    'failed',
    'SMTP timeout in seed simulation',
    null,
    now() - interval '6 hours',
    null,
    null,
    '11111111-1111-4111-8111-111111111111'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    null,
    'seed:email:failed:1'
  ),
  (
    '40000000-0000-0000-0000-000000000004'::uuid,
    'family+skipped@chsolutions.ca',
    'Duplicate message skipped',
    'family_enrollment_accepted_v1',
    '{"reason":"duplicate event key"}'::jsonb,
    'resend',
    null,
    'skipped',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    '88888888-8888-4888-8888-888888888888'::uuid,
    'seed:email:skipped:1'
  )
on conflict (id) do update
  set to_email = excluded.to_email,
      subject = excluded.subject,
      template_key = excluded.template_key,
      template_data = excluded.template_data,
      provider = excluded.provider,
      provider_message_id = excluded.provider_message_id,
      status = excluded.status,
      error_message = excluded.error_message,
      sent_at = excluded.sent_at,
      failed_at = excluded.failed_at,
      profile_id = excluded.profile_id,
      family_profile_id = excluded.family_profile_id,
      workshop_enrollment_id = excluded.workshop_enrollment_id,
      event_key = excluded.event_key;
