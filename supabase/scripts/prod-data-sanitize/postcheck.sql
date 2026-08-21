-- Return one result set because `supabase db query --file` executes one
-- prepared statement and does not accept multiple top-level statements.
with kinds as (
  select
    case when exists (
      select 1 from pg_enum
      where enumtypid = 'public.semester_survey_kind'::regtype
        and enumlabel = 'pre_program_survey'
    ) then 'pre_program_survey' else 'pre_survey' end as pre_kind,
    case when exists (
      select 1 from pg_enum
      where enumtypid = 'public.semester_survey_kind'::regtype
        and enumlabel = 'post_program_survey'
    ) then 'post_program_survey' else 'post_survey' end as post_kind
),
survey_counts as (
  select
    s.id,
    sum(case when sfr.kind::text = (select pre_kind from kinds) and sfr.is_active then 1 else 0 end) as active_pre,
    sum(case when sfr.kind::text = (select post_kind from kinds) and sfr.is_active then 1 else 0 end) as active_post
  from public.semester s
  left join public.semester_form_requirement sfr on sfr.semester_id = s.id
  group by s.id
),
email_checks as (
  select 'auth.users.email' as source, count(*) as non_chsolutions
  from auth.users
  where email is not null and lower(split_part(email, '@', 2)) <> 'chsolutions.ca'
  union all
  select 'public.profile.email', count(*)
  from public.profile
  where email is not null and lower(split_part(email, '@', 2)) <> 'chsolutions.ca'
  union all
  select 'public.invites.invitee_email', count(*)
  from public.invites
  where invitee_email is not null and lower(split_part(invitee_email, '@', 2)) <> 'chsolutions.ca'
  union all
  select 'public.email_message.to_email', count(*)
  from public.email_message
  where to_email is not null and lower(split_part(to_email, '@', 2)) <> 'chsolutions.ca'
  union all
  select 'public.login_event.email', count(*)
  from public.login_event
  where email is not null and lower(split_part(email, '@', 2)) <> 'chsolutions.ca'
  union all
  select 'public.sign_up_terms_consent.email', count(*)
  from public.sign_up_terms_consent
  where email is not null and lower(split_part(email, '@', 2)) <> 'chsolutions.ca'
)
select
  'missing_form_refs' as check_name,
  jsonb_build_object('count', count(*)) as details
from public.form_submission fs
left join public.form f on f.id = fs.form_id
where f.id is null
union all
select
  'semester_survey_requirements',
  jsonb_build_object(
    'semester_id', id,
    'active_pre', active_pre,
    'active_post', active_post
  )
from survey_counts
union all
select
  'non_chsolutions_email',
  jsonb_build_object('source', source, 'count', non_chsolutions)
from email_checks;
