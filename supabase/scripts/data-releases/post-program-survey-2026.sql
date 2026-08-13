-- Run this complete file in the Supabase production SQL Editor.
-- It updates every active post-survey form. It preserves question codes,
-- types, submissions, and answers. The transaction rolls back on validation failure.

begin;

create temporary table approved_post_program_questions (
  question_code text primary key,
  prompt text not null,
  question_type public.form_question_type not null,
  options jsonb not null,
  position integer not null unique,
  metadata jsonb not null
) on commit drop;

insert into approved_post_program_questions (
  question_code,
  prompt,
  question_type,
  options,
  position,
  metadata
)
values
  ('post_skill_snacks_fruit_veg', 'Since participating in summerlunch+, my child can make snacks with fruits and vegetables.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 1, '{"section":"Post-program skills"}'),
  ('post_skill_follow_recipe', 'Since participating in summerlunch+, my child can follow a recipe.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 2, '{"section":"Post-program skills"}'),
  ('post_skill_help_family_meals', 'Since participating in summerlunch+, my child can help make meals for the family.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 3, '{"section":"Post-program skills"}'),
  ('post_skill_cut_food_safely', 'Since participating in summerlunch+, my child can safely cut up food.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 4, '{"section":"Post-program skills"}'),
  ('post_skill_measure_ingredients', 'Since participating in summerlunch+, my child can measure ingredients.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 5, '{"section":"Post-program skills"}'),
  ('post_skill_enjoys_cooking', 'Since participating in summerlunch+, my child enjoys cooking and/or helping in the kitchen.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 6, '{"section":"Post-program skills"}'),
  ('post_skill_confident', 'Since participating in summerlunch+, my child feels confident in their cooking skills.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 7, '{"section":"Post-program skills"}'),
  ('post_skill_nutrition_knowledge', 'Since participating in summerlunch+, my child knows more about nutrition and healthy eating.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 8, '{"section":"Post-program skills"}'),
  ('post_skill_nutrition_label', 'Since participating in summerlunch+, my child can understand the Nutrition Facts table on food packages.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 9, '{"section":"Post-program skills"}'),
  ('post_intake_fruits', 'During the summer, while participating in summerlunch+, how often did your family eat fruit each week?', 'single_choice', '["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]', 10, '{"section":"Post-program intake"}'),
  ('post_intake_vegetables', 'During the summer, while participating in summerlunch+, how often did your family eat vegetables each week?', 'single_choice', '["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]', 11, '{"section":"Post-program intake"}'),
  ('post_intake_whole_grains', 'During the summer, while participating in summerlunch+, how often did your family eat whole grains each week?', 'single_choice', '["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]', 12, '{"section":"Post-program intake"}'),
  ('post_intake_sugary_beverages', 'During the summer, while participating in summerlunch+, how often did your family drink sugary beverages (e.g., juice, soda, energy drinks, sports drinks) each week?', 'single_choice', '["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]', 13, '{"section":"Post-program intake"}'),
  ('post_food_worry', 'During the summer, while participating in summerlunch+, my family worried about food running out before we had money to buy more.', 'single_choice', '["Yes","Sometimes","No"]', 14, '{"section":"Post-program food affordability"}'),
  ('post_food_healthy_afford', 'During the summer, while participating in summerlunch+, it was easier for my family to buy healthy foods each week.', 'single_choice', '["Yes","Sometimes","No"]', 15, '{"section":"Post-program food affordability"}'),
  ('post_food_bank_usage', 'During the summer, while participating in summerlunch+, my family used food banks or pantries during July and August.', 'single_choice', '["Yes","Sometimes","No"]', 16, '{"section":"Post-program food affordability"}'),
  ('post_food_bank_most_of', 'Since participating in summerlunch+, my family knows how to make the most of food from food banks or pantries.', 'single_choice', '["Yes","Sometimes","No"]', 17, '{"section":"Post-program food affordability"}'),
  ('post_school_instructions', 'Participating in summerlunch+ helped my child practice following instructions and routines during the summer.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 18, '{"section":"Post-program school readiness"}'),
  ('post_school_engaged', 'The weekly activities in summerlunch+ kept my child mentally engaged and learning over the summer.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 19, '{"section":"Post-program school readiness"}'),
  ('post_school_ready', 'Cooking and learning throughout the summer helped my child feel ready to return to school in September.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 20, '{"section":"Post-program school readiness"}'),
  ('post_school_skills', 'My child used reading, math, or measuring skills while cooking in the summerlunch+ program.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 21, '{"section":"Post-program school readiness"}'),
  ('post_connection_connected', 'During the summer, while participating in summerlunch+, my child felt more connected to other people.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 22, '{"section":"Post-program connection and anticipation"}'),
  ('post_connection_look_forward', 'During the summer, while participating in summerlunch+, the weekly classes and activities gave my child something to look forward to each week.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 23, '{"section":"Post-program connection and anticipation"}'),
  ('post_trust_prepare', 'Since participating in summerlunch+, I trust my child to prepare their own snacks or meals.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 24, '{"section":"Post-program trust, confidence, and responsibility"}'),
  ('post_trust_independence', 'Since participating in summerlunch+, my child has developed a greater sense of independence and responsibility.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 25, '{"section":"Post-program trust, confidence, and responsibility"}'),
  ('post_family_quality_time', 'During the summer, while participating in summerlunch+, our family had a reason to spend quality time together.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 26, '{"section":"Post-program family engagement"}'),
  ('post_family_cook_together', 'Since participating in summerlunch+, our family has spent more time cooking and eating together.', 'single_choice', '["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]', 27, '{"section":"Post-program family engagement"}'),
  ('post_feedback_overall_enjoyment', 'Overall, how much did your family enjoy the summerlunch+ program (cooking classes, activities, grocery cards/meal kits, etc.)?', 'single_choice', '["1 star","2 stars","3 stars","4 stars","5 stars"]', 28, '{"section":"Post-program feedback"}'),
  ('post_feedback_like_most', 'What did your family like the most about the cooking classes?', 'text', '[]', 29, '{"optional":true,"section":"Post-program feedback"}'),
  ('post_feedback_do_differently', 'Is there anything you wish we could do differently next time?', 'text', '[]', 30, '{"optional":true,"section":"Post-program feedback"}'),
  ('post_feedback_child_learned', 'What did your child learn, and how will your family use what you learned in daily life?', 'text', '[]', 31, '{"optional":true,"section":"Post-program feedback"}'),
  ('post_feedback_recipes_future', 'Keeping in mind that our meals use 100% plant-based proteins such as beans, legumes, and tofu to promote sustainability, affordability, and health benefits, are there any plant-based recipes or foods you and your family would like to learn to make for next summer?', 'text', '[]', 32, '{"optional":true,"section":"Post-program feedback"}'),
  ('post_feedback_other_comments', 'Do you have any other comments or feedback for the summerlunch+ program or team members?', 'text', '[]', 33, '{"optional":true,"section":"Post-program feedback"}');

do $$
declare
  active_form_count integer;
  invalid_codes text;
begin
  select count(*)
    into active_form_count
  from public.semester_form_requirement
  where is_active = true
    and kind::text in ('post_survey', 'post_program_survey');

  if active_form_count = 0 then
    raise exception 'No active post-program survey form exists';
  end if;

  select string_agg(question.question_code, ', ' order by question.question_code)
    into invalid_codes
  from public.form_question as question
  join approved_post_program_questions as approved using (question_code)
  where question.type <> approved.question_type;

  if invalid_codes is not null then
    raise exception 'Existing question types differ from the approved survey: %', invalid_codes;
  end if;
end;
$$;

insert into public.form_question (question_code, prompt, type, options)
select question_code, prompt, question_type, options
from approved_post_program_questions
on conflict (question_code) do nothing;

with active_post_forms as (
  select distinct form_id
  from public.semester_form_requirement
  where is_active = true
    and kind::text in ('post_survey', 'post_program_survey')
)
update public.form_question_map as map
set position = map.position + 1000
from active_post_forms as form
join approved_post_program_questions as approved on true
where map.form_id = form.form_id
  and map.question_code = approved.question_code;

with active_post_forms as (
  select distinct form_id
  from public.semester_form_requirement
  where is_active = true
    and kind::text in ('post_survey', 'post_program_survey')
)
insert into public.form_question_map (
  form_id,
  question_code,
  position,
  prompt_override,
  options_override,
  metadata,
  visibility_condition
)
select
  form.form_id,
  approved.question_code,
  approved.position,
  approved.prompt,
  approved.options,
  approved.metadata,
  null
from active_post_forms as form
cross join approved_post_program_questions as approved
on conflict (form_id, question_code) do update
set
  position = excluded.position,
  prompt_override = excluded.prompt_override,
  options_override = excluded.options_override,
  metadata = excluded.metadata,
  visibility_condition = null;

do $$
declare
  invalid_form_ids text;
begin
  select string_agg(form_id::text, ', ' order by form_id::text)
    into invalid_form_ids
  from (
    select form.form_id
    from (
      select distinct form_id
      from public.semester_form_requirement
      where is_active = true
        and kind::text in ('post_survey', 'post_program_survey')
    ) as form
    where (
      select count(*)
      from public.form_question_map as map
      where map.form_id = form.form_id
    ) <> 33
    or (
      select array_agg(map.question_code order by map.position)
      from public.form_question_map as map
      where map.form_id = form.form_id
    ) is distinct from (
      select array_agg(approved.question_code order by approved.position)
      from approved_post_program_questions as approved
    )
  ) as validation;

  if invalid_form_ids is not null then
    raise exception 'Active post-program survey form validation failed: %', invalid_form_ids;
  end if;
end;
$$;

select
  form.id as form_id,
  form.name,
  map.position,
  map.question_code,
  map.prompt_override,
  map.options_override,
  map.metadata
from public.form as form
join public.semester_form_requirement as requirement on requirement.form_id = form.id
join public.form_question_map as map on map.form_id = form.id
where requirement.is_active = true
  and requirement.kind::text in ('post_survey', 'post_program_survey')
order by form.id, map.position;

commit;
