-- Seed onboarding form and default permissions.

with form_row as (
  insert into public.form (name, is_required, auto_assign)
  values ('Onboarding Survey', true, array['unassigned']::app_role[])
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
)
insert into public.form_question (form_id, prompt, kind, position, options)
select id, 'Where do you live?', 'text'::form_question_type, 1, '[]'::jsonb from form_row
union all
select id, 'Have you been apart of summerlunch+ before?', 'single_choice'::form_question_type, 2, '["yes","no"]'::jsonb from form_row
on conflict (form_id, position) do update
  set prompt = excluded.prompt,
      kind = excluded.kind,
      options = excluded.options;

insert into public.form_assignment (form_id, user_id, assigned_by)
select fr.id, ur.user_id, null
from (select id from public.form where name = 'Onboarding Survey') fr
join public.user_roles ur on ur.role = 'unassigned'
on conflict (form_id, user_id) do nothing;

insert into public.role_permission (role, permission)
values
  ('admin', 'site.read'),
  ('manager', 'site.read'),
  ('staff', 'site.read'),
  ('instructor', 'site.read'),
  ('student', 'site.read'),
  ('parent', 'site.read')
on conflict (role, permission) do nothing;
