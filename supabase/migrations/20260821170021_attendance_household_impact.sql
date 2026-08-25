set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_attendance_household_impact()
 RETURNS TABLE(attendance_rows integer, attendance_profiles integer, families integer, people integer, children integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with recursive
family_edges as (
  select guardian_profile_id as profile_id, child_profile_id as connected_id
  from public.person_guardian_child
  union
  select child_profile_id, guardian_profile_id
  from public.person_guardian_child
),
family_reach(root_id, profile_id) as (
  select id, id from public.profile
  union
  select reach.root_id, edges.connected_id
  from family_reach reach
  join family_edges edges on edges.profile_id = reach.profile_id
),
family_members as (
  select profile_id, min(root_id::text)::uuid as family_id
  from family_reach
  group by profile_id
),
attendance as (
  select profile_id
  from public.class_attendance
  where state = 'active'
),
attendance_families as (
  select distinct members.family_id
  from attendance
  join family_members members on members.profile_id = attendance.profile_id
),
family_counts as (
  select
    members.family_id,
    count(*)::integer as graph_people,
    count(*) filter (where profile.role = 'student')::integer as graph_children
  from family_members members
  join attendance_families families on families.family_id = members.family_id
  join public.profile profile on profile.id = members.profile_id
  group by members.family_id
),
household_answers as (
  select
    members.family_id,
    answers.question_code,
    case
      when answers.question_code = 'household_total_people'
        and jsonb_typeof(answers.value) = 'number'
        and (answers.value #>> '{}')::numeric between 1 and 30
        then answers.value #>> '{}'
      when answers.question_code = 'household_total_people'
        and jsonb_typeof(answers.value) = 'string'
        and answers.value #>> '{}' ~ '^[0-9]+$'
        and (answers.value #>> '{}')::numeric between 1 and 30
        then answers.value #>> '{}'
      when answers.question_code = 'household_total_children'
        and jsonb_typeof(answers.value) = 'number'
        and (answers.value #>> '{}')::numeric between 0 and 30
        then answers.value #>> '{}'
      when answers.question_code = 'household_total_children'
        and jsonb_typeof(answers.value) = 'string'
        and answers.value #>> '{}' ~ '^[0-9]+$'
        and (answers.value #>> '{}')::numeric between 0 and 30
        then answers.value #>> '{}'
      else null
    end as answer_value,
    profile.role::text as respondent_role,
    row_number() over (
      partition by members.family_id, answers.question_code, profile.role
      order by submission.submitted_at desc, answers.id desc
    ) as role_answer_rank
  from public.form_answer answers
  join public.form_submission submission on submission.id = answers.submission_id
  join public.form form on form.id = submission.form_id
  join public.profile profile on profile.id = submission.profile_id
  join family_members members on members.profile_id = profile.id
  join attendance_families families on families.family_id = members.family_id
  where form.name = 'Household Counts'
    and answers.question_code in ('household_total_people', 'household_total_children')
),
family_households as (
  select
    counts.family_id,
    coalesce(max(people.answer_value)::integer, counts.graph_people) as people,
    coalesce(max(children.answer_value)::integer, counts.graph_children) as children
  from family_counts counts
  left join (
    select distinct on (family_id, question_code) family_id, question_code, answer_value
    from household_answers
    where answer_value is not null and role_answer_rank = 1
    order by family_id, question_code, case when respondent_role = 'guardian' then 0 else 1 end
  ) people on people.family_id = counts.family_id and people.question_code = 'household_total_people'
  left join (
    select distinct on (family_id, question_code) family_id, question_code, answer_value
    from household_answers
    where answer_value is not null and role_answer_rank = 1
    order by family_id, question_code, case when respondent_role = 'guardian' then 0 else 1 end
  ) children on children.family_id = counts.family_id and children.question_code = 'household_total_children'
  group by counts.family_id, counts.graph_people, counts.graph_children
)
select
  (select count(*)::integer from attendance),
  (select count(distinct profile_id)::integer from attendance),
  count(*)::integer,
  coalesce(sum(people), 0)::integer,
  coalesce(sum(children), 0)::integer
from family_households;
$function$
;

revoke all on function public.get_attendance_household_impact() from public, anon, authenticated;
grant execute on function public.get_attendance_household_impact() to service_role;
