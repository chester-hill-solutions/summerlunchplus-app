-- Seed mandatory sign-up flow forms and questions.

with program_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Program Background',
    true,
    array['student','parent','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
),
parent_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Parent Consent',
    true,
    array['parent','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
),
student_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Student Consent',
    true,
    array['student','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
)
insert into public.form_question (question_code, form_id, prompt, kind, position, options)
select 'program_background_inspiration', id, 'What inspired you to join summerlunch+ this season?', 'text'::form_question_type, 1, '[]'::jsonb from program_form
union all
select 'program_background_supports', id, 'Tell us about programs or supports you are currently part of.', 'text'::form_question_type, 2, '[]'::jsonb from program_form
union all
select 'program_background_accessibility', id, 'Are there accessibility or dietary needs we should know about?', 'text'::form_question_type, 3, '[]'::jsonb from program_form
union all
select 'parent_consent_acknowledge', id, 'I consent to my child attending summerlunch+ and understand the guidelines.', 'single_choice'::form_question_type, 1, '["yes","no"]'::jsonb from parent_form
union all
select 'parent_emergency_name', id, 'Emergency contact name', 'text'::form_question_type, 2, '[]'::jsonb from parent_form
union all
select 'parent_emergency_phone', id, 'Emergency contact phone', 'text'::form_question_type, 3, '[]'::jsonb from parent_form
union all
select 'parent_health_notes', id, 'Allergies, medications, or health notes', 'text'::form_question_type, 4, '[]'::jsonb from parent_form
union all
select 'student_consent_acknowledge', id, 'I agree to participate in summerlunch+ and follow program expectations.', 'single_choice'::form_question_type, 1, '["yes","no"]'::jsonb from student_form
union all
select 'student_consent_updates', id, 'Do you agree to let us share progress updates with your caregivers?', 'single_choice'::form_question_type, 2, '["yes","no"]'::jsonb from student_form
union all
select 'student_consent_details', id, 'Is there anything else we should know to support you?', 'text'::form_question_type, 3, '[]'::jsonb from student_form
on conflict (question_code) do update
  set prompt = excluded.prompt,
      kind = excluded.kind,
      options = excluded.options;

insert into public.sign_up_flow (form_id, slug, step_order, roles)
select id, 'program_background', 1, array['student','parent']::app_role[]
from public.form
where name = 'Program Background'
union all
select id, 'parent_consent', 2, array['parent']::app_role[]
from public.form
where name = 'Parent Consent'
union all
select id, 'student_consent', 3, array['student']::app_role[]
from public.form
where name = 'Student Consent'
on conflict (form_id) do update
  set slug = excluded.slug,
      step_order = excluded.step_order,
      roles = excluded.roles;
