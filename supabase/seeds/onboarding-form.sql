-- Seed onboarding form and default permissions.

with form_row as (
  insert into public.form (name, is_required, auto_assign)
  values ('Onboarding Survey', true, array['unassigned']::app_role[])
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
)
insert into public.form_question (question_code, prompt, "type", options)
select 'onboarding_where_you_live', 'Where do you live?', 'text'::form_question_type, '[]'::jsonb
union all
select 'onboarding_prior_participation', 'Have you been apart of summerlunch+ before?', 'single_choice'::form_question_type, '["yes","no"]'::jsonb
union all
select 'onboarding_partner_program', 'Partner-Program', 'text'::form_question_type, '[]'::jsonb
on conflict (question_code) do update
  set prompt = excluded.prompt,
      "type" = excluded."type",
      options = excluded.options;

with form_row as (
  select id from public.form where name = 'Onboarding Survey'
)
insert into public.form_question_map (form_id, question_code, position)
select id, 'onboarding_where_you_live', 1 from form_row
union all
select id, 'onboarding_prior_participation', 2 from form_row
union all
select id, 'onboarding_partner_program', 3 from form_row
on conflict (form_id, question_code) do update
  set position = excluded.position;

insert into public.form_assignment (form_id, user_id, assigned_by)
select fr.id, ur.user_id, null
from (select id from public.form where name = 'Onboarding Survey') fr
join public.user_roles ur on ur.role = 'unassigned'
on conflict (form_id, user_id) do nothing;

insert into public.role_permission (role, permission)
values
  ('manager', 'site.read'),
  ('staff', 'site.read'),
  ('instructor', 'site.read'),
  ('student', 'site.read'),
  ('guardian', 'site.read')
on conflict (role, permission) do nothing;
