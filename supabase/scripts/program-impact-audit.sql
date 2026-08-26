-- Independent program-impact audit for the production snapshot and local DB.
-- This query reports one row per family and semester. It does not use the
-- application aggregation code or expose names, email addresses, or card data.

with recursive
family_edges as (
  select guardian_profile_id as profile_id, child_profile_id as connected_id
  from public.person_guardian_child
  union
  select child_profile_id, guardian_profile_id
  from public.person_guardian_child
),
family_reach(root_id, profile_id) as (
  select id, id
  from public.profile
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
    profile.role as respondent_role,
    submission.submitted_at,
    row_number() over (
      partition by members.family_id, answers.question_code
      order by
        case when profile.role = 'guardian' then 0 else 1 end,
        submission.submitted_at desc,
        answers.id desc
    ) as answer_rank
  from public.form_answer answers
  join public.form_submission submission on submission.id = answers.submission_id
  join public.form form on form.id = submission.form_id
  join public.profile profile on profile.id = submission.profile_id
  join family_members members on members.profile_id = profile.id
  where form.name = 'Household Counts'
    and answers.question_code in ('household_total_people', 'household_total_children')
),
selected_household_answers as (
  select
    family_id,
    max(answer_value) filter (
      where question_code = 'household_total_people' and answer_rank = 1
    ) as answer_people,
    max(answer_value) filter (
      where question_code = 'household_total_children' and answer_rank = 1
    ) as answer_children,
    max(respondent_role::text) filter (
      where question_code = 'household_total_people' and answer_rank = 1
    ) as people_answer_role,
    max(respondent_role::text) filter (
      where question_code = 'household_total_children' and answer_rank = 1
    ) as children_answer_role
  from household_answers
  group by family_id
),
family_households as (
  select
    counts.family_id,
    coalesce(nullif(answers.answer_people, '')::integer, counts.graph_people) as people,
    coalesce(nullif(answers.answer_children, '')::integer, counts.graph_children) as children,
    case when answers.answer_people is null then 'family_graph' else answers.people_answer_role end as people_source,
    case when answers.answer_children is null then 'family_graph' else answers.children_answer_role end as children_source
  from family_counts counts
  left join selected_household_answers answers on answers.family_id = counts.family_id
),
accepted_enrollments as (
  select
    enrollment.semester_id,
    enrollment.workshop_id,
    enrollment.profile_id,
    enrollment.updated_at
  from public.workshop_enrollment enrollment
  where enrollment.status = 'approved'
),
attendance_rows as (
  select
    enrollment.semester_id,
    members.family_id,
    attendance.id,
    attendance.profile_id,
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
    count(*) filter (where has_participation_evidence and row_number <= 2)::integer as newest_two_evidence_rows,
    max(starts_at) as latest_class_at
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
    enrollment.semester_id,
    members.family_id,
    asset.id as asset_id,
    asset.value,
    asset.sent_at,
    allocation.blocked
  from public.gift_card_asset asset
  join public.gift_card_allocation allocation on allocation.gift_card_asset_id = asset.id
  join public.profile profile on profile.id = allocation.profile_id
  join family_members members on members.profile_id = profile.id
  left join public.class class on class.id = allocation.class_id
  left join public.workshop workshop on workshop.id = class.workshop_id
  left join public.semester semester on semester.id = workshop.semester_id
  left join public.workshop_enrollment enrollment
    on enrollment.profile_id = allocation.profile_id
   and enrollment.workshop_id = workshop.id
   and enrollment.semester_id = workshop.semester_id
  where asset.sent_at is not null
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
  md5(semesters.id::text) as semester_key,
  semesters.name as semester_name,
  md5(families.family_id::text) as family_key,
  coalesce(cards.sent_card_count, 0) as sent_card_count,
  coalesce(cards.blocked_sent_card_count, 0) as blocked_sent_card_count,
  coalesce(cards.sent_card_value, 0)::numeric(12, 2)::text as sent_card_value,
  households.people,
  households.children,
  households.people_source,
  households.children_source,
  coalesce(attendance.eligible_rows, 0) as eligible_attendance_rows,
  coalesce(attendance.completed_rows, 0) as completed_attendance_rows,
  coalesce(attendance.evidence_rows, 0) as participation_evidence_rows,
  coalesce(attendance.newest_two_evidence_rows, 0) as newest_row_evidence_count,
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
  end as participation_classification
from family_semesters families
join public.semester semesters on semesters.id = families.semester_id
join family_households households on households.family_id = families.family_id
left join attendance_summary attendance
  on attendance.semester_id = families.semester_id
 and attendance.family_id = families.family_id
left join card_summary cards
  on cards.semester_id = families.semester_id
 and cards.family_id = families.family_id
order by semesters.starts_at, families.family_id;
