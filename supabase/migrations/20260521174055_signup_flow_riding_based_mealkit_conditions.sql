with partner_form as (
  select id
  from public.form
  where name = 'Partner Organization'
), guardian_form as (
  select id
  from public.form
  where name = 'Guardian Consent'
)
delete from public.form_question_map fqm
using partner_form pf
where fqm.form_id = pf.id
  and fqm.question_code in ('partner_organization', 'partner_organization_other');

with guardian_form as (
  select id
  from public.form
  where name = 'Guardian Consent'
)
update public.form_question_map fqm
set visibility_condition = case
  when fqm.question_code in (
    'guardian_consent_thorncliffe_meal_kit',
    'guardian_consent_thorncliffe_pickup_schedule'
  ) then '{"question_code":"derived_is_meal_kit_riding","equals":true}'::jsonb
  when fqm.question_code = 'guardian_consent_gift_card' then '{"question_code":"derived_is_meal_kit_riding","not_equals":true}'::jsonb
  when fqm.question_code = 'gift_card_store_preference' then '{
    "all": [
      { "question_code": "derived_is_meal_kit_riding", "not_equals": true },
      { "question_code": "guardian_consent_gift_card", "equals": true }
    ]
  }'::jsonb
  else fqm.visibility_condition
end
from guardian_form gf
where fqm.form_id = gf.id
  and fqm.question_code in (
    'guardian_consent_thorncliffe_meal_kit',
    'guardian_consent_thorncliffe_pickup_schedule',
    'guardian_consent_gift_card',
    'gift_card_store_preference'
  );

delete from public.sign_up_flow sf
using public.form f
where sf.form_id = f.id
  and f.name = 'Partner Organization';

update public.sign_up_flow sf
set step_order = 8
from public.form f
where sf.form_id = f.id
  and f.name = 'Guardian Consent';
