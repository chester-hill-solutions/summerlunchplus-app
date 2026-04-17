-- Ensure semester survey forms are created after testing semesters exist.

with pre_forms as (
  insert into public.form (name, is_required, auto_assign)
  select
    format('Pre-Semester Survey - %s', s.id),
    false,
    '{}'::app_role[]
  from public.semester s
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
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
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
)
select count(*) from post_forms;

with pre_forms as (
  select id from public.form where name like 'Pre-Semester Survey - %'
), pre_questions as (
  select * from (
    values
      ('pre_barriers', 1, '{}'::jsonb),
      ('pre_barriers_other', 2, '{"optional":true}'::jsonb),
      ('pre_skill_snacks_fruit_veg', 3, '{}'::jsonb),
      ('pre_skill_follow_recipe', 4, '{}'::jsonb),
      ('pre_skill_help_family_meals', 5, '{}'::jsonb),
      ('pre_skill_cut_food_safely', 6, '{}'::jsonb),
      ('pre_skill_measure_ingredients', 7, '{}'::jsonb),
      ('pre_skill_enjoys_cooking', 8, '{}'::jsonb),
      ('pre_skill_confident', 9, '{}'::jsonb),
      ('pre_skill_nutrition_knowledge', 10, '{}'::jsonb),
      ('pre_skill_nutrition_label', 11, '{}'::jsonb),
      ('pre_intake_fruits', 12, '{}'::jsonb),
      ('pre_intake_vegetables', 13, '{}'::jsonb),
      ('pre_intake_whole_grains', 14, '{}'::jsonb),
      ('pre_intake_sugary_beverages', 15, '{}'::jsonb),
      ('pre_food_worry', 16, '{}'::jsonb),
      ('pre_food_healthy_afford', 17, '{}'::jsonb),
      ('pre_food_bank_usage', 18, '{}'::jsonb),
      ('pre_food_bank_most_of', 19, '{}'::jsonb)
  ) as q(question_code, position, metadata)
)
insert into public.form_question_map (
  form_id,
  question_code,
  position,
  metadata,
  visibility_condition
)
select f.id, q.question_code, q.position, q.metadata, null::jsonb
from pre_forms f
cross join pre_questions q
on conflict (form_id, question_code) do update
  set position = excluded.position,
      metadata = excluded.metadata,
      visibility_condition = excluded.visibility_condition;

with post_forms as (
  select id from public.form where name like 'Post-Semester Survey - %'
), post_questions as (
  select * from (
    values
      ('post_skill_snacks_fruit_veg', 1, '{}'::jsonb),
      ('post_skill_follow_recipe', 2, '{}'::jsonb),
      ('post_skill_help_family_meals', 3, '{}'::jsonb),
      ('post_skill_cut_food_safely', 4, '{}'::jsonb),
      ('post_skill_measure_ingredients', 5, '{}'::jsonb),
      ('post_skill_enjoys_cooking', 6, '{}'::jsonb),
      ('post_skill_confident', 7, '{}'::jsonb),
      ('post_skill_nutrition_knowledge', 8, '{}'::jsonb),
      ('post_skill_nutrition_label', 9, '{}'::jsonb),
      ('post_intake_fruits', 10, '{}'::jsonb),
      ('post_intake_vegetables', 11, '{}'::jsonb),
      ('post_intake_whole_grains', 12, '{}'::jsonb),
      ('post_intake_sugary_beverages', 13, '{}'::jsonb),
      ('post_food_worry', 14, '{}'::jsonb),
      ('post_food_healthy_afford', 15, '{}'::jsonb),
      ('post_food_bank_usage', 16, '{}'::jsonb),
      ('post_food_bank_most_of', 17, '{}'::jsonb),
      ('post_school_instructions', 18, '{}'::jsonb),
      ('post_school_engaged', 19, '{}'::jsonb),
      ('post_school_ready', 20, '{}'::jsonb),
      ('post_school_skills', 21, '{}'::jsonb),
      ('post_connection_connected', 22, '{}'::jsonb),
      ('post_connection_look_forward', 23, '{}'::jsonb),
      ('post_trust_prepare', 24, '{}'::jsonb),
      ('post_trust_independence', 25, '{}'::jsonb),
      ('post_family_quality_time', 26, '{}'::jsonb),
      ('post_family_cook_together', 27, '{}'::jsonb),
      ('post_feedback_overall_enjoyment', 28, '{}'::jsonb),
      ('post_feedback_like_most', 29, '{"optional":true}'::jsonb),
      ('post_feedback_do_differently', 30, '{"optional":true}'::jsonb),
      ('post_feedback_child_learned', 31, '{"optional":true}'::jsonb),
      ('post_feedback_recipes_future', 32, '{"optional":true}'::jsonb),
      ('post_feedback_other_comments', 33, '{"optional":true}'::jsonb)
  ) as q(question_code, position, metadata)
)
insert into public.form_question_map (
  form_id,
  question_code,
  position,
  metadata,
  visibility_condition
)
select f.id, q.question_code, q.position, q.metadata, null::jsonb
from post_forms f
cross join post_questions q
on conflict (form_id, question_code) do update
  set position = excluded.position,
      metadata = excluded.metadata,
      visibility_condition = excluded.visibility_condition;
