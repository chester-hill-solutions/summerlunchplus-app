update public.form_question
set "type" = 'single_choice'::public.form_question_type,
    options = '["Yes","No"]'::jsonb
where question_code = 'guardian_consent_interview';

update public.form_answer
set value = case
  when value = 'true'::jsonb then '"Yes"'::jsonb
  when value = 'false'::jsonb then '"No"'::jsonb
  else value
end
where question_code = 'guardian_consent_interview'
  and jsonb_typeof(value) = 'boolean';
