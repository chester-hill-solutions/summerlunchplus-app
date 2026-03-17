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
guardian_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Guardian Consent',
    true,
    array['guardian','unassigned']::app_role[]
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
insert into public.form_question (question_code, prompt, "type", options)
select 'program_background_first_time', 'Is this your first time participating in the summerlunch+ program?', 'single_choice'::form_question_type, '["Yes","No"]'::jsonb
union all
select 'program_background_summer', 'Which summer is this for you in the program?', 'single_choice'::form_question_type, '["2nd","3rd","4th","5th"]'::jsonb
union all
select 'program_background_barriers', 'Is there anything that prevents you from preparing and eating more healthy foods? Please select all that apply.', 'multi_choice'::form_question_type, jsonb $$["Healthy food costs too much","I don't have healthy recipes","I don't know which foods are healthy","I don't know which methods of cooking are healthy","Fresh fruits and vegetables are not available","It takes too much time to buy, prepare, or cook healthy foods","I don't know how to cook healthy foods","I don't have the right kitchen equipment or utensils","I don't like the taste of healthy foods","I don't always like trying new things","Nothing prevents me from eating healthy","I know how to prepare and eat healthy foods","I don't have healthy recipes, Healthy food costs too much","I don't know which foods are healthy, Healthy food costs too much","I don't know which foods are healthy, I don't know how to cook healthy foods","I don't know which methods of cooking are healthy, Healthy food costs too much","I don't know which methods of cooking are healthy, I don't have healthy recipes","I don't know which methods of cooking are healthy, Fresh fruits and vegetables are not available","Fresh fruits and vegetables are not available, I don't have the right kitchen equipment or utensils","Fresh fruits and vegetables are not available, Healthy food costs too much","Healthy food costs too much, I don't know how to cook healthy foods","Healthy food costs too much, I don't like the taste of healthy foods","Fresh fruits and vegetables are not available, Healthy food costs too much, I don't have the right kitchen equipment or utensils"]$$
union all
select 'program_background_agreement_snacks', 'I can make snacks with fruits and vegetables.', 'agreement'::form_question_type, '[]'::jsonb
union all
select 'program_background_agreement_follow_recipe', 'With help, I can follow a recipe.', 'agreement'::form_question_type, '[]'::jsonb
union all
select 'program_background_agreement_help', 'I can help make meals for my family.', 'agreement'::form_question_type, '[]'::jsonb
union all
select 'program_background_agreement_cut', 'I can cut up food.', 'agreement'::form_question_type, '[]'::jsonb
union all
select 'program_background_agreement_measure', 'I can measure ingredients.', 'agreement'::form_question_type, '[]'::jsonb
union all
select 'program_background_agreement_enjoy', 'I enjoy cooking and/or helping in the kitchen.', 'agreement'::form_question_type, '[]'::jsonb
union all
select 'program_background_agreement_confident', 'I am confident in my cooking skills.', 'agreement'::form_question_type, '[]'::jsonb
union all
select 'program_background_agreement_nutrition', 'I know a lot about nutrition and healthy eating.', 'agreement'::form_question_type, '[]'::jsonb
union all
select 'program_background_importance_balance', 'How important is it for you to eat balanced meals and snacks?', 'single_choice'::form_question_type, '["Very important","Somewhat important","Not very important"]'::jsonb
union all
select 'program_background_understand_nutrition', 'I can understand the nutrition facts table (e.g., amount of energy, sugar, protein, etc.) on food packages.', 'single_choice'::form_question_type, '["Usually","Sometimes","Always","Never"]'::jsonb
union all
select 'program_background_fruits_frequency', 'How often do you eat fruits each week?', 'single_choice'::form_question_type, '["More than 2 times per day","1 time per day","A few times per week","Once a week","Less than once a week"]'::jsonb
union all
select 'program_background_vegetables_frequency', 'How often do you eat vegetables each week?', 'single_choice'::form_question_type, '["More than 2 times per day","1 time per day","A few times per week","Once a week","Less than once a week","Never"]'::jsonb
union all
select 'program_background_whole_grains_frequency', 'How often do you eat whole grains/whole grain foods each week?', 'single_choice'::form_question_type, '["More than 2 times per day","1 time per day","A few times per week","Once a week","Less than once a week"]'::jsonb
union all
select 'program_background_sugary_frequency', 'How often do you drink sugary beverages (e.g. juice, pop, soda, ice-tea, energy drinks, sports drinks, etc.)', 'single_choice'::form_question_type, '["More than 2 times per day","A few times per week","Once a week","Less than once a week","Never"]'::jsonb
union all
select 'guardian_consent_privacy', 'I understand that summerlunch+ is dedicated to protecting my privacy and will only use my personal data for the administration of the virtual summer cooking program and for communicating pertinent program-related information.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'guardian_consent_presence', 'I understand that a guardian/caregiver or elder sibling must be present during live cooking classes to ensure the safety of the summerlunch+ participant.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'guardian_consent_attendance', 'I understand that if my child(ren) do(es) not participate in 2 weeks of programming without notice, they will need to forfeit their spot in the program. Please let the summerlunch+ team know in advance if you need to miss a week of the program.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'guardian_consent_photos', 'I give permission to summerlunch+ to use the photos and comments I share to the summerlunch+ platform for their social media and website.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'student_consent_gift_card', 'I understand that I will be receiving a grocery gift card or grocery meal kit every week to make the recipes provided by summerlunch+.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'student_consent_questionnaire', 'I will participate in the pre and post program questionnaires.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'student_consent_interview', 'Can summerlunch+ contact you for an interview? Participants will be provided a gift card for participation in our interview.', 'checkbox'::form_question_type, '[]'::jsonb
on conflict (question_code) do update
  set prompt = excluded.prompt,
      "type" = excluded."type",
      options = excluded.options;

with program_form as (
  select id from public.form where name = 'Program Background'
), guardian_form as (
  select id from public.form where name = 'Guardian Consent'
), student_form as (
  select id from public.form where name = 'Student Consent'
)
insert into public.form_question_map (form_id, question_code, position)
select id, 'program_background_first_time', 1 from program_form
union all
select id, 'program_background_summer', 2 from program_form
union all
select id, 'program_background_barriers', 3 from program_form
union all
select id, 'program_background_agreement_snacks', 4 from program_form
union all
select id, 'program_background_agreement_follow_recipe', 5 from program_form
union all
select id, 'program_background_agreement_help', 6 from program_form
union all
select id, 'program_background_agreement_cut', 7 from program_form
union all
select id, 'program_background_agreement_measure', 8 from program_form
union all
select id, 'program_background_agreement_enjoy', 9 from program_form
union all
select id, 'program_background_agreement_confident', 10 from program_form
union all
select id, 'program_background_agreement_nutrition', 11 from program_form
union all
select id, 'program_background_importance_balance', 12 from program_form
union all
select id, 'program_background_understand_nutrition', 13 from program_form
union all
select id, 'program_background_fruits_frequency', 14 from program_form
union all
select id, 'program_background_vegetables_frequency', 15 from program_form
union all
select id, 'program_background_whole_grains_frequency', 16 from program_form
union all
select id, 'program_background_sugary_frequency', 17 from program_form
union all
select id, 'guardian_consent_privacy', 18 from guardian_form
union all
select id, 'guardian_consent_presence', 19 from guardian_form
union all
select id, 'guardian_consent_attendance', 20 from guardian_form
union all
select id, 'guardian_consent_photos', 21 from guardian_form
union all
select id, 'student_consent_gift_card', 22 from student_form
union all
select id, 'student_consent_questionnaire', 23 from student_form
union all
select id, 'student_consent_interview', 24 from student_form
on conflict (form_id, question_code) do update
  set position = excluded.position;

insert into public.sign_up_flow (form_id, slug, step_order, roles)
select id, 'program_background', 1, array['student']::app_role[]
from public.form
where name = 'Program Background'
union all
select id, 'guardian_consent', 2, array['guardian']::app_role[]
from public.form
where name = 'Guardian Consent'
union all
select id, 'student_consent', 3, array['student']::app_role[]
from public.form
where name = 'Student Consent'
on conflict (form_id) do update
  set slug = excluded.slug,
      step_order = excluded.step_order,
      roles = excluded.roles;
