update public.form_question
set type = 'number'::public.form_question_type
where question_code in ('household_total_people', 'household_total_children');
