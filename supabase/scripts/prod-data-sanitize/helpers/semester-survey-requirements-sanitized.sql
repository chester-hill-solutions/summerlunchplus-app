-- Restore semester survey links for snapshot semesters.
-- These links are runtime-semester-specific and are required for /enroll pre/post survey flows.

with pre_forms as (
  insert into public.form (name, is_required, auto_assign)
  select
    format('Pre-Semester Survey - %s', s.id),
    false,
    '{}'::app_role[]
  from public.semester s
  on conflict (name) do nothing
  returning id
)
select count(*) from pre_forms;

with post_forms as (
  insert into public.form (name, is_required, auto_assign)
  select
    format('Post-Semester Survey - %s', s.id),
    false,
    '{}'::app_role[]
  from public.semester s
  on conflict (name) do nothing
  returning id
)
select count(*) from post_forms;

with kind_labels as (
  select
    case
      when exists (
        select 1
        from pg_enum
        where enumtypid = 'public.semester_survey_kind'::regtype
          and enumlabel = 'pre_program_survey'
      ) then 'pre_program_survey'
      else 'pre_survey'
    end as pre_kind,
    case
      when exists (
        select 1
        from pg_enum
        where enumtypid = 'public.semester_survey_kind'::regtype
          and enumlabel = 'post_program_survey'
      ) then 'post_program_survey'
      else 'post_survey'
    end as post_kind
), pre_pairs as (
  select s.id as semester_id, f.id as form_id
  from public.semester s
  join public.form f on f.name = format('Pre-Semester Survey - %s', s.id)
), post_pairs as (
  select s.id as semester_id, f.id as form_id
  from public.semester s
  join public.form f on f.name = format('Post-Semester Survey - %s', s.id)
)
update public.semester_form_requirement sfr
set is_active = false
where sfr.is_active = true
  and (
    (sfr.kind = (select pre_kind from kind_labels)::public.semester_survey_kind and exists (
      select 1 from pre_pairs p
      where p.semester_id = sfr.semester_id
        and p.form_id <> sfr.form_id
    ))
    or
    (sfr.kind = (select post_kind from kind_labels)::public.semester_survey_kind and exists (
      select 1 from post_pairs p
      where p.semester_id = sfr.semester_id
        and p.form_id <> sfr.form_id
    ))
  );

with kind_labels as (
  select
    case
      when exists (
        select 1
        from pg_enum
        where enumtypid = 'public.semester_survey_kind'::regtype
          and enumlabel = 'pre_program_survey'
      ) then 'pre_program_survey'
      else 'pre_survey'
    end as pre_kind
)
insert into public.semester_form_requirement (semester_id, form_id, kind, is_required, is_active)
select s.id, f.id, (select pre_kind from kind_labels)::public.semester_survey_kind, true, true
from public.semester s
join public.form f on f.name = format('Pre-Semester Survey - %s', s.id)
on conflict (semester_id, form_id, kind) do update
  set is_required = excluded.is_required,
      is_active = excluded.is_active;

with kind_labels as (
  select
    case
      when exists (
        select 1
        from pg_enum
        where enumtypid = 'public.semester_survey_kind'::regtype
          and enumlabel = 'post_program_survey'
      ) then 'post_program_survey'
      else 'post_survey'
    end as post_kind
)
insert into public.semester_form_requirement (semester_id, form_id, kind, is_required, is_active)
select s.id, f.id, (select post_kind from kind_labels)::public.semester_survey_kind, true, true
from public.semester s
join public.form f on f.name = format('Post-Semester Survey - %s', s.id)
on conflict (semester_id, form_id, kind) do update
  set is_required = excluded.is_required,
      is_active = excluded.is_active;
