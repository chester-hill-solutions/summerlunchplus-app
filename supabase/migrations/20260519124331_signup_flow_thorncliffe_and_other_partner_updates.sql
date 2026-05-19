insert into public.form_question (question_code, prompt, "type", options)
values
  (
    'partner_organization_other',
    'Please specify your partner organization',
    'text'::public.form_question_type,
    '[]'::jsonb
  ),
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

with partner_form as (
  select id from public.form where name = 'Partner Organization'
), guardian_form as (
  select id from public.form where name = 'Guardian Consent'
)
update public.form_question_map fqm
set position = fqm.position + 100
from guardian_form gf
where fqm.form_id = gf.id
  and fqm.question_code in (
    'guardian_consent_gift_card',
    'gift_card_store_preference',
    'guardian_consent_questionnaire',
    'guardian_consent_interview'
  );

with partner_form as (
  select id from public.form where name = 'Partner Organization'
), guardian_form as (
  select id from public.form where name = 'Guardian Consent'
)
insert into public.form_question_map (form_id, question_code, position, metadata, visibility_condition)
select id, 'partner_organization_other', 2, '{"target":"profile","role":"guardian","field":"partner_program","placeholder":"Partner organization name"}'::jsonb, '{"question_code":"partner_organization","equals":"Other"}'::jsonb
from partner_form
union all
select id, 'guardian_consent_thorncliffe_meal_kit', 6, '{}'::jsonb, '{"question_code":"partner_organization","equals":"Thorncliffe Park -TNO"}'::jsonb
from guardian_form
union all
select id, 'guardian_consent_thorncliffe_pickup_schedule', 7, '{}'::jsonb, '{"question_code":"partner_organization","equals":"Thorncliffe Park -TNO"}'::jsonb
from guardian_form
union all
select id, 'guardian_consent_gift_card', 8, '{}'::jsonb, '{
  "any": [
    { "question_code": "partner_organization", "equals": "Taylor-Massey & Oakridge" },
    { "question_code": "partner_organization", "equals": "Milton Food for Life" },
    { "question_code": "partner_organization", "equals": "Gloucester -GEFC" },
    { "question_code": "partner_organization", "equals": "Orangeville Food Bank" },
    { "question_code": "partner_organization", "equals": "Cresent Town Community" },
    { "question_code": "partner_organization", "equals": "Eastview Community Centre" },
    { "question_code": "partner_organization", "equals": "Greenest City" },
    { "question_code": "partner_organization", "equals": "Partage Vanier" },
    { "question_code": "partner_organization", "equals": "Parkdale Community Food Bank" },
    { "question_code": "partner_organization", "equals": "Hamilton - Eva Rothwell Centre" },
    { "question_code": "partner_organization", "equals": "Corktown Community" }
  ]
}'::jsonb
from guardian_form
union all
select id, 'gift_card_store_preference', 9, '{}'::jsonb, '{
  "all": [
    {
      "any": [
        { "question_code": "partner_organization", "equals": "Taylor-Massey & Oakridge" },
        { "question_code": "partner_organization", "equals": "Milton Food for Life" },
        { "question_code": "partner_organization", "equals": "Gloucester -GEFC" },
        { "question_code": "partner_organization", "equals": "Orangeville Food Bank" },
        { "question_code": "partner_organization", "equals": "Cresent Town Community" },
        { "question_code": "partner_organization", "equals": "Eastview Community Centre" },
        { "question_code": "partner_organization", "equals": "Greenest City" },
        { "question_code": "partner_organization", "equals": "Partage Vanier" },
        { "question_code": "partner_organization", "equals": "Parkdale Community Food Bank" },
        { "question_code": "partner_organization", "equals": "Hamilton - Eva Rothwell Centre" },
        { "question_code": "partner_organization", "equals": "Corktown Community" }
      ]
    },
    { "question_code": "guardian_consent_gift_card", "equals": true }
  ]
}'::jsonb
from guardian_form
union all
select id, 'guardian_consent_questionnaire', 10, '{}'::jsonb, null::jsonb
from guardian_form
union all
select id, 'guardian_consent_interview', 11, '{}'::jsonb, null::jsonb
from guardian_form
on conflict (form_id, question_code) do update
  set position = excluded.position,
      metadata = excluded.metadata,
      visibility_condition = excluded.visibility_condition;

delete from public.sign_up_flow sf
using public.form f
where sf.form_id = f.id
  and f.name = 'Additional Guardians';
