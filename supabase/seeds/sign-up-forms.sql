-- Seed mandatory sign-up flow forms and questions.

with program_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Program Background',
    true,
    array['student','unassigned']::app_role[]
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
insert into public.form_question (question_code, form_id, prompt, "type", position, options)
select 'program_background_first_time', id, 'Is this your first time participating in the summerlunch+ program?', 'single_choice'::form_question_type, 1, '["Yes","No"]'::jsonb from program_form
union all
select 'program_background_summer', id, 'Which summer is this for you in the program?', 'single_choice'::form_question_type, 2, '["2nd","3rd","4th","5th"]'::jsonb from program_form
union all
select 'program_background_barriers', id, 'Is there anything that prevents you from preparing and eating more healthy foods? Please select all that apply.', 'multi_choice'::form_question_type, 3, jsonb $$["Healthy food costs too much","I don't have healthy recipes","I don't know which foods are healthy","I don't know which methods of cooking are healthy","Fresh fruits and vegetables are not available","It takes too much time to buy, prepare, or cook healthy foods","I don't know how to cook healthy foods","I don't have the right kitchen equipment or utensils","I don't like the taste of healthy foods","I don't always like trying new things","Nothing prevents me from eating healthy","I know how to prepare and eat healthy foods","I don't have healthy recipes, Healthy food costs too much","I don't know which foods are healthy, Healthy food costs too much","I don't know which foods are healthy, I don't know how to cook healthy foods","I don't know which methods of cooking are healthy, Healthy food costs too much","I don't know which methods of cooking are healthy, I don't have healthy recipes","I don't know which methods of cooking are healthy, Fresh fruits and vegetables are not available","Fresh fruits and vegetables are not available, I don't have the right kitchen equipment or utensils","Fresh fruits and vegetables are not available, Healthy food costs too much","Healthy food costs too much, I don't know how to cook healthy foods","Healthy food costs too much, I don't like the taste of healthy foods","Fresh fruits and vegetables are not available, Healthy food costs too much, I don't have the right kitchen equipment or utensils"]$$ from program_form
union all
select 'program_background_agreement_snacks', id, 'I can make snacks with fruits and vegetables.', 'agreement'::form_question_type, 4, '[]'::jsonb from program_form
union all
select 'program_background_agreement_follow_recipe', id, 'With help, I can follow a recipe.', 'agreement'::form_question_type, 5, '[]'::jsonb from program_form
union all
select 'program_background_agreement_help', id, 'I can help make meals for my family.', 'agreement'::form_question_type, 6, '[]'::jsonb from program_form
union all
select 'program_background_agreement_cut', id, 'I can cut up food.', 'agreement'::form_question_type, 7, '[]'::jsonb from program_form
union all
select 'program_background_agreement_measure', id, 'I can measure ingredients.', 'agreement'::form_question_type, 8, '[]'::jsonb from program_form
union all
select 'program_background_agreement_enjoy', id, 'I enjoy cooking and/or helping in the kitchen.', 'agreement'::form_question_type, 9, '[]'::jsonb from program_form
union all
select 'program_background_agreement_confident', id, 'I am confident in my cooking skills.', 'agreement'::form_question_type, 10, '[]'::jsonb from program_form
union all
select 'program_background_agreement_nutrition', id, 'I know a lot about nutrition and healthy eating.', 'agreement'::form_question_type, 11, '[]'::jsonb from program_form
union all
select 'program_background_importance_balance', id, 'How important is it for you to eat balanced meals and snacks?', 'single_choice'::form_question_type, 12, '["Very important","Somewhat important","Not very important"]'::jsonb from program_form
union all
select 'program_background_understand_nutrition', id, 'I can understand the nutrition facts table (e.g., amount of energy, sugar, protein, etc.) on food packages.', 'single_choice'::form_question_type, 13, '["Usually","Sometimes","Always","Never"]'::jsonb from program_form
union all
select 'program_background_fruits_frequency', id, 'How often do you eat fruits each week?', 'single_choice'::form_question_type, 14, '["More than 2 times per day","1 time per day","A few times per week","Once a week","Less than once a week"]'::jsonb from program_form
union all
select 'program_background_vegetables_frequency', id, 'How often do you eat vegetables each week?', 'single_choice'::form_question_type, 15, '["More than 2 times per day","1 time per day","A few times per week","Once a week","Less than once a week","Never"]'::jsonb from program_form
union all
select 'program_background_whole_grains_frequency', id, 'How often do you eat whole grains/whole grain foods each week?', 'single_choice'::form_question_type, 16, '["More than 2 times per day","1 time per day","A few times per week","Once a week","Less than once a week"]'::jsonb from program_form
union all
select 'program_background_sugary_frequency', id, 'How often do you drink sugary beverages (e.g. juice, pop, soda, ice-tea, energy drinks, sports drinks, etc.)', 'single_choice'::form_question_type, 17, '["More than 2 times per day","A few times per week","Once a week","Less than once a week","Never"]'::jsonb from program_form
union all
select 'parent_consent_acknowledge', id, 'I consent to my child attending summerlunch+ and understand the guidelines.', 'single_choice'::form_question_type, 18, '["yes","no"]'::jsonb from parent_form
union all
select 'parent_emergency_name', id, 'Emergency contact name', 'text'::form_question_type, 19, '[]'::jsonb from parent_form
union all
select 'parent_emergency_phone', id, 'Emergency contact phone', 'text'::form_question_type, 20, '[]'::jsonb from parent_form
union all
select 'parent_health_notes', id, 'Allergies, medications, or health notes', 'text'::form_question_type, 21, '[]'::jsonb from parent_form
union all
select 'student_consent_acknowledge', id, 'I agree to participate in summerlunch+ and follow program expectations.', 'single_choice'::form_question_type, 22, '["yes","no"]'::jsonb from student_form
union all
select 'student_consent_updates', id, 'Do you agree to let us share progress updates with your caregivers?', 'single_choice'::form_question_type, 23, '["yes","no"]'::jsonb from student_form
union all
select 'student_consent_details', id, 'Is there anything else we should know to support you?', 'text'::form_question_type, 24, '[]'::jsonb from student_form
on conflict (question_code) do update
  set prompt = excluded.prompt,
      "type" = excluded."type",
      options = excluded.options;

insert into public.sign_up_flow (form_id, slug, step_order, roles)
select id, 'program_background', 1, array['student']::app_role[]
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
