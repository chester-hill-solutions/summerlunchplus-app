insert into public.form_question (question_code, prompt, "type", options)
values
  (
    'guardian_consent_thorncliffe_meal_kit',
    'I understand that each week I will need to pick up a meal kit that includes all the ingredients needed for my child(ren) to make the three recipes at home.',
    'checkbox'::public.form_question_type,
    '[]'::jsonb
  ),
  (
    'guardian_consent_thorncliffe_pickup_schedule',
    $$I understand that the meal kit pick-up day, time and location is:

Tuesday
1:00 PM – 6:00 PM
TNO Youth Hub, East York Town Centre$$,
    'checkbox'::public.form_question_type,
    '[]'::jsonb
  )
on conflict (question_code) do update
  set prompt = excluded.prompt,
      "type" = excluded."type",
      options = excluded.options;
