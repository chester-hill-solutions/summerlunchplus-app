-- 1) Any form_submission rows pointing to missing form?
select count(*) as missing_form_refs
from public.form_submission fs
left join public.form f on f.id = fs.form_id
where f.id is null;

-- 2) Any semesters missing active pre/post requirements?
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
)
select
  s.id as semester_id,
  sum(case when sfr.kind::text = (select pre_kind from kinds) and sfr.is_active then 1 else 0 end) as active_pre,
  sum(case when sfr.kind::text = (select post_kind from kinds) and sfr.is_active then 1 else 0 end) as active_post
from public.semester s
left join public.semester_form_requirement sfr on sfr.semester_id = s.id
group by s.id
order by s.id;

-- 3) Non-chsolutions email count across key columns.
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
where email is not null and lower(split_part(email, '@', 2)) <> 'chsolutions.ca';
