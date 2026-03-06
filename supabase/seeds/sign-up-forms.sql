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
select 'parent_consent_privacy', id, 'I understand that summerlunch+ is dedicated to protecting my privacy and will only use my personal data for the administration of the virtual summer cooking program and for communicating pertinent program-related information.', 'checkbox'::form_question_type, 18, '[]'::jsonb from parent_form
union all
select 'parent_consent_presence', id, 'I understand that a parent/caregiver or elder sibling must be present during live cooking classes to ensure the safety of the summerlunch+ participant.', 'checkbox'::form_question_type, 19, '[]'::jsonb from parent_form
union all
select 'parent_consent_attendance', id, 'I understand that if my child(ren) do(es) not participate in 2 weeks of programming without notice, they will need to forfeit their spot in the program. Please let the summerlunch+ team know in advance if you need to miss a week of the program.', 'checkbox'::form_question_type, 20, '[]'::jsonb from parent_form
union all
select 'parent_consent_photos', id, 'I give permission to summerlunch+ to use the photos and comments I share to the summerlunch+ platform for their social media and website.', 'checkbox'::form_question_type, 21, '[]'::jsonb from parent_form
union all
select 'student_consent_gift_card', id, 'I understand that I will be receiving a grocery gift card or grocery meal kit every week to make the recipes provided by summerlunch+.', 'checkbox'::form_question_type, 22, '[]'::jsonb from student_form
union all
select 'student_consent_questionnaire', id, 'I will participate in the pre and post program questionnaires.', 'checkbox'::form_question_type, 23, '[]'::jsonb from student_form
union all
select 'student_consent_interview', id, 'Can summerlunch+ contact you for an interview? Participants will be provided a gift card for participation in our interview.', 'checkbox'::form_question_type, 24, '[]'::jsonb from student_form
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
