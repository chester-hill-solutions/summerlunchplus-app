create or replace function public.get_program_impact(
  p_semester_id uuid default null,
  p_as_of timestamptz default now()
)
returns table (
  semester_id uuid,
  semester_name text,
  family_key text,
  sent_card_count integer,
  blocked_sent_card_count integer,
  sent_card_value numeric(12, 2),
  people integer,
  children integer,
  people_source text,
  children_source text,
  eligible_attendance_rows integer,
  completed_attendance_rows integer,
  participation_evidence_rows integer,
  newest_row_evidence_count integer,
  participation_classification text
)
language sql
security definer
set search_path = public
as $$
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
family_counts as (
  select
    members.family_id,
    count(*)::integer as graph_people,
    count(*) filter (where profile.role = 'student')::integer as graph_children
  from family_members members
  join public.profile profile on profile.id = members.profile_id
  group by members.family_id
),
household_answers as (
  select
    members.family_id,
    answers.question_code,
    case
      when jsonb_typeof(answers.value) = 'number'
        and (answers.value #>> '{}')::numeric between 0 and 100
        then answers.value #>> '{}'
      when jsonb_typeof(answers.value) = 'string'
        and answers.value #>> '{}' ~ '^[0-9]+$'
        and (answers.value #>> '{}')::numeric between 0 and 100
        then answers.value #>> '{}'
      else null
    end as answer_value,
    profile.role::text as respondent_role,
    submission.submitted_at,
    row_number() over (
      partition by members.family_id, answers.question_code, profile.role
      order by submission.submitted_at desc, answers.id desc
    ) as role_answer_rank
  from public.form_answer answers
  join public.form_submission submission on submission.id = answers.submission_id
  join public.form form on form.id = submission.form_id
  join public.profile profile on profile.id = submission.profile_id
  join family_members members on members.profile_id = profile.id
  where form.name = 'Household Counts'
    and answers.question_code in ('household_total_people', 'household_total_children')
),
selected_household_answers as (
  select distinct on (family_id, question_code)
    family_id,
    question_code,
    answer_value,
    respondent_role
  from household_answers
  where answer_value is not null and role_answer_rank = 1
  order by family_id, question_code,
    case when respondent_role = 'guardian' then 0 else 1 end
),
family_households as (
  select
    counts.family_id,
    coalesce(
      max(people.answer_value)::integer,
      counts.graph_people
    ) as people,
    coalesce(
      max(children.answer_value)::integer,
      counts.graph_children
    ) as children,
    coalesce(max(people.respondent_role), 'family_graph') as people_source,
    coalesce(max(children.respondent_role), 'family_graph') as children_source
  from family_counts counts
  left join selected_household_answers people
    on people.family_id = counts.family_id
   and people.question_code = 'household_total_people'
  left join selected_household_answers children
    on children.family_id = counts.family_id
   and children.question_code = 'household_total_children'
  group by counts.family_id, counts.graph_people, counts.graph_children
),
accepted_enrollments as (
  select
    enrollment.semester_id,
    enrollment.workshop_id,
    enrollment.profile_id
  from public.workshop_enrollment enrollment
  where enrollment.status = 'approved'
    and (p_semester_id is null or enrollment.semester_id = p_semester_id)
),
attendance_rows as (
  select
    enrollment.semester_id,
    members.family_id,
    attendance.id,
    class.starts_at,
    attendance.created_at,
    attendance.status,
    attendance.photo_status,
    (
      attendance.status = 'present'
      or attendance.photo_status in ('uploaded', 'accepted')
    ) as has_participation_evidence
  from accepted_enrollments enrollment
  join public.class class on class.workshop_id = enrollment.workshop_id
   and class.ends_at <= p_as_of
  join public.class_attendance attendance
    on attendance.class_id = class.id
   and attendance.profile_id = enrollment.profile_id
   and attendance.state = 'active'
  join family_members members on members.profile_id = attendance.profile_id
),
attendance_summary as (
  select
    semester_id,
    family_id,
    count(*)::integer as eligible_rows,
    count(*) filter (where status is not null or photo_status is not null)::integer as completed_rows,
    count(*) filter (where has_participation_evidence)::integer as evidence_rows,
    count(*) filter (where has_participation_evidence and row_number <= 2)::integer as newest_two_evidence_rows
  from (
    select
      rows.*,
      row_number() over (
        partition by rows.semester_id, rows.family_id
        order by rows.starts_at desc, rows.created_at desc, rows.id desc
      ) as row_number
    from attendance_rows rows
  ) ranked
  group by semester_id, family_id
),
card_rows as (
  select distinct on (asset.id)
    coalesce(enrollment.semester_id, workshop.semester_id) as semester_id,
    members.family_id,
    asset.id as asset_id,
    asset.value,
    allocation.blocked
  from public.gift_card_asset asset
  join public.gift_card_allocation allocation on allocation.gift_card_asset_id = asset.id
  join family_members members on members.profile_id = allocation.profile_id
  join public.class class on class.id = allocation.class_id
  join public.workshop workshop on workshop.id = class.workshop_id
  left join public.workshop_enrollment enrollment
    on enrollment.profile_id = allocation.profile_id
   and enrollment.workshop_id = workshop.id
   and enrollment.semester_id = workshop.semester_id
  where asset.sent_at is not null
    and asset.sent_at <= p_as_of
    and (p_semester_id is null or workshop.semester_id = p_semester_id)
  order by asset.id, enrollment.updated_at desc nulls last
),
card_summary as (
  select
    semester_id,
    family_id,
    count(*)::integer as sent_card_count,
    count(*) filter (where blocked)::integer as blocked_sent_card_count,
    sum(value)::numeric(12, 2) as sent_card_value
  from card_rows
  group by semester_id, family_id
),
family_semesters as (
  select semester_id, family_id from accepted_enrollments enrollment
  join family_members members on members.profile_id = enrollment.profile_id
  union
  select semester_id, family_id from card_rows
)
select
  semesters.id,
  semesters.name,
  md5(families.family_id::text),
  coalesce(cards.sent_card_count, 0),
  coalesce(cards.blocked_sent_card_count, 0),
  coalesce(cards.sent_card_value, 0)::numeric(12, 2),
  households.people,
  households.children,
  households.people_source,
  households.children_source,
  coalesce(attendance.eligible_rows, 0),
  coalesce(attendance.completed_rows, 0),
  coalesce(attendance.evidence_rows, 0),
  coalesce(attendance.newest_two_evidence_rows, 0),
  case
    when coalesce(attendance.completed_rows, 0) = 0
      and coalesce(attendance.eligible_rows, 0) > 0
      then 'provisional'
    when coalesce(attendance.eligible_rows, 0) > 0
      and attendance.evidence_rows * 2 > attendance.eligible_rows
      and attendance.newest_two_evidence_rows > 0
      then 'participating'
    when coalesce(attendance.eligible_rows, 0) > 0
      then 'not_participating'
    else 'no_attendance'
  end
from family_semesters families
join public.semester semesters on semesters.id = families.semester_id
join family_households households on households.family_id = families.family_id
left join attendance_summary attendance
  on attendance.semester_id = families.semester_id
 and attendance.family_id = families.family_id
left join card_summary cards
  on cards.semester_id = families.semester_id
 and cards.family_id = families.family_id
where p_semester_id is null or semesters.id = p_semester_id
order by semesters.starts_at, families.family_id;
$$;

revoke all on function public.get_program_impact(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_program_impact(uuid, timestamptz) to service_role;


create or replace function public.get_attendance_household_impact()
returns table (
  attendance_rows integer,
  attendance_profiles integer,
  families integer,
  people integer,
  children integer
)
language sql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.get_attendance_household_impact() from public, anon, authenticated;
grant execute on function public.get_attendance_household_impact() to service_role;
