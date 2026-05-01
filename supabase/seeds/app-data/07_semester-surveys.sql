-- Semester-scoped family pre/post surveys.

with semester_forms as (
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
select count(*) from semester_forms;

with semester_forms as (
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
select count(*) from semester_forms;

insert into public.form_question (question_code, prompt, "type", options)
select * from (
  values
    (
      'pre_barriers',
      'Is there anything that prevents your family from preparing and eating more healthy foods? Please select all that apply.',
      'multi_choice'::form_question_type,
      $$[
        "I don't know which foods are healthy",
        "I don't know which methods of cooking are healthy",
        "I don't have healthy recipes",
        "Fresh fruits and vegetables are not available",
        "Healthy food costs too much",
        "I don't have the right kitchen equipment",
        "I don't like the taste of healthy food",
        "It takes too much time",
        "Other"
      ]$$::jsonb
    ),
    ('pre_barriers_other', 'If you selected Other, please describe.', 'text'::form_question_type, '[]'::jsonb),

    ('pre_skill_snacks_fruit_veg', 'My child can make snacks with fruits and vegetables.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('pre_skill_follow_recipe', 'My child can follow a recipe.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('pre_skill_help_family_meals', 'My child can help make meals for the family.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('pre_skill_cut_food_safely', 'My child can safely cut up food.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('pre_skill_measure_ingredients', 'My child can measure ingredients.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('pre_skill_enjoys_cooking', 'My child enjoys cooking and or helping in the kitchen.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('pre_skill_confident', 'My child is confident in their current cooking skills.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('pre_skill_nutrition_knowledge', 'My child knows a lot about nutrition and healthy eating.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('pre_skill_nutrition_label', 'My child can understand the nutrition facts table on food packages.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),

    ('pre_intake_fruits', 'How often does your family eat fruits each week?', 'single_choice'::form_question_type, $$["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]$$::jsonb),
    ('pre_intake_vegetables', 'How often does your family eat vegetables each week?', 'single_choice'::form_question_type, $$["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]$$::jsonb),
    ('pre_intake_whole_grains', 'How often does your family eat whole grains each week?', 'single_choice'::form_question_type, $$["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]$$::jsonb),
    ('pre_intake_sugary_beverages', 'How often does your family drink sugary beverages (e.g., juice, soda, energy drinks, sports drinks) each week?', 'single_choice'::form_question_type, $$["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]$$::jsonb),

    ('pre_food_worry', 'My family worries that food might run out before we have money to buy more.', 'single_choice'::form_question_type, $$["Yes","Sometimes","No"]$$::jsonb),
    ('pre_food_healthy_afford', 'It is difficult for my family to buy healthy foods each week.', 'single_choice'::form_question_type, $$["Yes","Sometimes","No"]$$::jsonb),
    ('pre_food_bank_usage', 'In the past 6 months prior to enrolling in summerlunch+ my family used food banks or pantries to meet our food needs.', 'single_choice'::form_question_type, $$["Yes","Sometimes","No"]$$::jsonb),
    ('pre_food_bank_most_of', 'My family knows how to make the most of food from food banks or pantries.', 'single_choice'::form_question_type, $$["Yes","Sometimes","No"]$$::jsonb),

    ('post_skill_snacks_fruit_veg', 'My child can make snacks with fruits and vegetables.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_skill_follow_recipe', 'My child can follow a recipe.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_skill_help_family_meals', 'My child can help make meals for the family.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_skill_cut_food_safely', 'My child can safely cut up food.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_skill_measure_ingredients', 'My child can measure ingredients.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_skill_enjoys_cooking', 'My child enjoys cooking and or helping in the kitchen.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_skill_confident', 'My child is confident in their current cooking skills.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_skill_nutrition_knowledge', 'My child knows a lot about nutrition and healthy eating.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_skill_nutrition_label', 'My child can understand the nutrition facts table on food packages.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),

    ('post_intake_fruits', 'How often does your family eat fruits each week?', 'single_choice'::form_question_type, $$["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]$$::jsonb),
    ('post_intake_vegetables', 'How often does your family eat vegetables each week?', 'single_choice'::form_question_type, $$["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]$$::jsonb),
    ('post_intake_whole_grains', 'How often does your family eat whole grains each week?', 'single_choice'::form_question_type, $$["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]$$::jsonb),
    ('post_intake_sugary_beverages', 'How often does your family drink sugary beverages (e.g., juice, soda, energy drinks, sports drinks) each week?', 'single_choice'::form_question_type, $$["Less than once per week","Once per week","A few times per week","Once per day","Many times per day"]$$::jsonb),

    ('post_food_worry', 'During the summer, while participating in summerlunch+, my family worried about food running out before we had money to buy more.', 'single_choice'::form_question_type, $$["Yes","Sometimes","No"]$$::jsonb),
    ('post_food_healthy_afford', 'During the summer, while participating in summerlunch+, it was easier for my family to buy healthy foods each week.', 'single_choice'::form_question_type, $$["Yes","Sometimes","No"]$$::jsonb),
    ('post_food_bank_usage', 'During the summer, while participating in summerlunch+, my family used food banks or pantries during July and August.', 'single_choice'::form_question_type, $$["Yes","Sometimes","No"]$$::jsonb),
    ('post_food_bank_most_of', 'Since participating in summerlunch+, my family knows how to make the most of food from food banks or pantries.', 'single_choice'::form_question_type, $$["Yes","Sometimes","No"]$$::jsonb),

    ('post_school_instructions', 'Participating in summerlunch+ helped my child practice following instructions and routines during the summer.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_school_engaged', 'The weekly activities in summerlunch+ kept my child mentally engaged and learning over the summer.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_school_ready', 'Cooking and learning throughout the summer helped my child feel ready to return to school in September.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_school_skills', 'My child used reading, math, or measuring skills while cooking in the summerlunch+ program.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),

    ('post_connection_connected', 'My child felt more connected to other people over the summer because of the summerlunch+ program.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_connection_look_forward', 'The weekly classes and activities gave my child something to look forward to each week.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),

    ('post_trust_prepare', 'Since participating in summerlunch+, I trust my child to prepare their own snacks or meals.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_trust_independence', 'The program helped build my child''s sense of independence and responsibility.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),

    ('post_family_quality_time', 'summerlunch+ gave our family a reason to spend quality time together.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),
    ('post_family_cook_together', 'Since completing the summerlunch+ program, I have spent more time cooking and eating with my family.', 'single_choice'::form_question_type, $$["Strongly agree","Agree","Neutral","Disagree","Strongly disagree"]$$::jsonb),

    ('post_feedback_overall_enjoyment', 'Overall, how much did your family enjoy the summerlunch+ program (cooking classes, activities, grocery cards/meal kits, etc.)?', 'single_choice'::form_question_type, $$["1 star","2 stars","3 stars","4 stars","5 stars"]$$::jsonb),
    ('post_feedback_like_most', 'What did your family like the most about the cooking classes?', 'text'::form_question_type, '[]'::jsonb),
    ('post_feedback_do_differently', 'Is there anything you wish we could do differently next time?', 'text'::form_question_type, '[]'::jsonb),
    ('post_feedback_child_learned', 'What did your child learn, and how will your family use what you learned in daily life?', 'text'::form_question_type, '[]'::jsonb),
    ('post_feedback_recipes_future', 'Are there any recipes or foods your family would like to learn to make in the future?', 'text'::form_question_type, '[]'::jsonb),
    ('post_feedback_other_comments', 'Do you have any other comments or feedback for the summerlunch+ program or team members?', 'text'::form_question_type, '[]'::jsonb)
) as seeded(question_code, prompt, "type", options)
on conflict (question_code) do update
  set prompt = excluded.prompt,
      "type" = excluded."type",
      options = excluded.options;

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
