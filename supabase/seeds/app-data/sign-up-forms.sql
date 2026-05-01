-- Seed mandatory sign-up flow forms and questions.

with profile_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Profile Information',
    true,
    array['guardian','student','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
), guardian_details_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Guardian Details',
    true,
    array['student','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
), child_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Child Information',
    true,
    array['guardian','student','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
), address_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Household Address',
    true,
    array['guardian','student','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
), child_email_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Child Email',
    true,
    array['guardian','student','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
), additional_guardian_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Additional Guardians',
    false,
    array['guardian','student','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
), household_counts_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Household Counts',
    true,
    array['guardian','student','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
), partner_form as (
  insert into public.form (name, is_required, auto_assign)
  values (
    'Partner Organization',
    true,
    array['guardian','unassigned']::app_role[]
  )
  on conflict (name) do update
    set is_required = excluded.is_required,
        auto_assign = excluded.auto_assign
  returning id
), guardian_form as (
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
)
insert into public.form_question (question_code, prompt, "type", options)
select 'guardian_self_firstname', 'Your first name', 'text'::form_question_type, '[]'::jsonb
union all
select 'guardian_self_surname', 'Your surname', 'text'::form_question_type, '[]'::jsonb
union all
select 'guardian_self_phone', 'Your phone number', 'text'::form_question_type, '[]'::jsonb
union all
select 'guardian_firstname', 'Guardian first name', 'text'::form_question_type, '[]'::jsonb
union all
select 'guardian_surname', 'Guardian surname', 'text'::form_question_type, '[]'::jsonb
union all
select 'guardian_email', 'Guardian Gmail', 'text'::form_question_type, '[]'::jsonb
union all
select 'guardian_phone', 'Guardian phone number', 'text'::form_question_type, '[]'::jsonb
union all
select 'child_firstname', 'Child first name', 'text'::form_question_type, '[]'::jsonb
union all
select 'child_surname', 'Child surname', 'text'::form_question_type, '[]'::jsonb
union all
select 'child_date_of_birth', 'Child date of birth', 'date'::form_question_type, '[]'::jsonb
union all
select 'child_prior_participation', 'Has this child participated in Summerlunch+ before?', 'single_choice'::form_question_type, $$[
  "No - this is their 1st summer",
  "Yes - this is their 2nd summer",
  "Yes - this is their 3rd summer",
  "Yes - this is their 4th summer",
  "Yes - this is their 5th summer"
]$$::jsonb
union all
select 'address_street', 'Street address', 'text'::form_question_type, '[]'::jsonb
union all
select 'address_city', 'City', 'text'::form_question_type, '[]'::jsonb
union all
select 'address_province', 'Province', 'text'::form_question_type, '[]'::jsonb
union all
select 'address_postal_code', 'Postal code', 'text'::form_question_type, '[]'::jsonb
union all
select 'child_has_email', 'Does the child have their own email?', 'single_choice'::form_question_type, '["Yes","No"]'::jsonb
union all
select 'child_email', 'Child Gmail', 'text'::form_question_type, '[]'::jsonb
union all
select 'additional_guardian_firstname', 'Additional guardian first name', 'text'::form_question_type, '[]'::jsonb
union all
select 'additional_guardian_surname', 'Additional guardian surname', 'text'::form_question_type, '[]'::jsonb
union all
select 'additional_guardian_email', 'Additional guardian Gmail', 'text'::form_question_type, '[]'::jsonb
union all
select 'household_total_people', 'Total people in the household', 'text'::form_question_type, '[]'::jsonb
union all
select 'household_total_children', 'Total children in the household', 'text'::form_question_type, '[]'::jsonb
union all
select 'partner_organization', 'Partner organization', 'single_choice'::form_question_type, $$[
  "Thorncliffe Park -TNO",
  "Taylor-Massey & Oakridge",
  "Milton Food for Life",
  "Gloucester -GEFC",
  "Orangeville Food Bank",
  "Cresent Town Community",
  "Eastview Community Centre",
  "Greenest City",
  "Partage Vanier",
  "Parkdale Community Food Bank",
  "Hamilton - Eva Rothwell Centre",
  "Corktown Community",
  "Other"
]$$::jsonb
union all
select 'guardian_consent_privacy', 'I understand that summerlunch+ is dedicated to protecting my privacy and will use my personal data only for the administration of the virtual summer cooking program and for communicating pertinent program-related information.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'guardian_consent_presence', 'I understand that a guardian/caregiver or elder sibling must be present during live cooking classes to ensure the safety of the summerlunch+ participant.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'guardian_consent_camera', 'I understand that cameras must remain ON during live cooking classes for engagement and safety purposes. If cameras are not on, you must provide a photo of one of the recipes that you prepared.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'guardian_consent_attendance', 'I understand that if my child(ren) do(es) not participate in two weeks of programming without notice, they will forfeit their spot in the program. Please let the summerlunch+ team know in advance if you need to miss a week.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'guardian_consent_photos', 'I give permission to summerlunch+ to use the photos and comments I share to the summerlunch+ platform for their social media and website.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'guardian_consent_gift_card', 'I understand that if I will receive a $40 grocery gift card at the end of each week, it is as reimbursement for the grocery items that I purchased to participate in the cooking class.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'gift_card_store_preference', 'Which store would you like to receive the card from?', 'single_choice'::form_question_type, $$[
  "Presidents Choice (ex, No Frills, Loblaws, Real Canadian Superstore, Zehrs, T&T, Fortinos)",
  "Sobeys (ex. FreshCo, Sobeys, Safeway, Foodland, IGA, Thrifty Foods)"
]$$::jsonb
union all
select 'guardian_consent_questionnaire', 'I agree to participate in the pre- and post-program questionnaires.', 'checkbox'::form_question_type, '[]'::jsonb
union all
select 'guardian_consent_interview', 'May summerlunch+ contact you for an interview after the program has finished?', 'checkbox'::form_question_type, '[]'::jsonb
on conflict (question_code) do update
  set prompt = excluded.prompt,
      "type" = excluded."type",
      options = excluded.options;

with profile_form as (
  select id from public.form where name = 'Profile Information'
), guardian_details_form as (
  select id from public.form where name = 'Guardian Details'
), child_form as (
  select id from public.form where name = 'Child Information'
), address_form as (
  select id from public.form where name = 'Household Address'
), child_email_form as (
  select id from public.form where name = 'Child Email'
), additional_guardian_form as (
  select id from public.form where name = 'Additional Guardians'
), household_counts_form as (
  select id from public.form where name = 'Household Counts'
), partner_form as (
  select id from public.form where name = 'Partner Organization'
), guardian_form as (
  select id from public.form where name = 'Guardian Consent'
)
insert into public.form_question_map (form_id, question_code, position, metadata, visibility_condition)
select id, 'guardian_self_firstname', 1, '{"target":"profile","role":"self","field":"firstname"}'::jsonb, null::jsonb from profile_form
union all
select id, 'guardian_self_surname', 2, '{"target":"profile","role":"self","field":"surname"}'::jsonb, null::jsonb from profile_form
union all
select id, 'guardian_self_phone', 3, '{"target":"profile","role":"self","field":"phone","input_type":"tel","autocomplete":"tel"}'::jsonb, null::jsonb from profile_form
union all
select id, 'guardian_firstname', 1, '{"target":"profile","role":"guardian","field":"firstname"}'::jsonb, null::jsonb from guardian_details_form
union all
select id, 'guardian_surname', 2, '{"target":"profile","role":"guardian","field":"surname"}'::jsonb, null::jsonb from guardian_details_form
union all
select id, 'guardian_email', 3, '{"target":"profile","role":"guardian","field":"email","input_type":"email","autocomplete":"email","action":"invite_guardian"}'::jsonb, null::jsonb from guardian_details_form
union all
select id, 'guardian_phone', 4, '{"target":"profile","role":"guardian","field":"phone","input_type":"tel","autocomplete":"tel"}'::jsonb, null::jsonb from guardian_details_form
union all
select id, 'child_firstname', 1, '{"target":"profile","role":"child","field":"firstname"}'::jsonb, null::jsonb from child_form
union all
select id, 'child_surname', 2, '{"target":"profile","role":"child","field":"surname"}'::jsonb, null::jsonb from child_form
union all
select id, 'child_date_of_birth', 3, '{"target":"profile","role":"child","field":"date_of_birth"}'::jsonb, null::jsonb from child_form
union all
select id, 'child_prior_participation', 4, '{}'::jsonb, null::jsonb from child_form
union all
select id, 'address_street', 1, '{"target":"profile","role":"guardian","field":"street_address"}'::jsonb, null::jsonb from address_form
union all
select id, 'address_city', 2, '{"target":"profile","role":"guardian","field":"city"}'::jsonb, null::jsonb from address_form
union all
select id, 'address_province', 3, '{"target":"profile","role":"guardian","field":"province"}'::jsonb, null::jsonb from address_form
union all
select id, 'address_postal_code', 4, '{"target":"profile","role":"guardian","field":"postcode","autocomplete":"postal-code"}'::jsonb, null::jsonb from address_form
union all
select id, 'child_has_email', 1, '{"key":"child_has_email"}'::jsonb, null::jsonb from child_email_form
union all
select id, 'child_email', 2, '{"target":"profile","role":"child","field":"email","input_type":"email","action":"invite_child"}'::jsonb, '{"question_code":"child_has_email","equals":"Yes"}'::jsonb from child_email_form
union all
select id, 'additional_guardian_firstname', 1, '{"target":"additional_guardian","field":"firstname","optional":true}'::jsonb, null::jsonb from additional_guardian_form
union all
select id, 'additional_guardian_surname', 2, '{"target":"additional_guardian","field":"surname","optional":true}'::jsonb, null::jsonb from additional_guardian_form
union all
select id, 'additional_guardian_email', 3, '{"target":"additional_guardian","field":"email","input_type":"email","optional":true}'::jsonb, null::jsonb from additional_guardian_form
union all
select id, 'household_total_people', 1, '{"target":"profile","role":"guardian","field":"household_size","input_type":"number","min":1}'::jsonb, null::jsonb from household_counts_form
union all
select id, 'household_total_children', 2, '{"target":"profile","role":"guardian","field":"household_children_count","input_type":"number","min":0}'::jsonb, null::jsonb from household_counts_form
union all
select id, 'partner_organization', 1, '{"target":"profile","role":"guardian","field":"partner_program","ui":"select"}'::jsonb, null::jsonb from partner_form
union all
select id, 'guardian_consent_privacy', 1, '{}'::jsonb, null::jsonb from guardian_form
union all
select id, 'guardian_consent_presence', 2, '{}'::jsonb, null::jsonb from guardian_form
union all
select id, 'guardian_consent_camera', 3, '{}'::jsonb, null::jsonb from guardian_form
union all
select id, 'guardian_consent_attendance', 4, '{}'::jsonb, null::jsonb from guardian_form
union all
select id, 'guardian_consent_photos', 5, '{}'::jsonb, null::jsonb from guardian_form
union all
select id, 'guardian_consent_gift_card', 6, '{}'::jsonb, '{
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
}'::jsonb from guardian_form
union all
select id, 'gift_card_store_preference', 7, '{}'::jsonb, '{
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
}'::jsonb from guardian_form
union all
select id, 'guardian_consent_questionnaire', 8, '{}'::jsonb, null::jsonb from guardian_form
union all
select id, 'guardian_consent_interview', 9, '{}'::jsonb, null::jsonb from guardian_form
on conflict (form_id, question_code) do update
  set position = excluded.position,
      metadata = excluded.metadata,
      visibility_condition = excluded.visibility_condition;

insert into public.sign_up_flow (form_id, slug, step_order, roles)
select id, 'profile_information', 1, array['guardian','student']::app_role[]
from public.form
where name = 'Profile Information'
union all
select id, 'guardian_details', 2, array['student']::app_role[]
from public.form
where name = 'Guardian Details'
union all
select id, 'child_information', 3, array['guardian']::app_role[]
from public.form
where name = 'Child Information'
union all
select id, 'child_email', 4, array['guardian']::app_role[]
from public.form
where name = 'Child Email'
union all
select id, 'household_address', 5, array['guardian','student']::app_role[]
from public.form
where name = 'Household Address'
union all
select id, 'additional_guardians', 6, array['guardian','student']::app_role[]
from public.form
where name = 'Additional Guardians'
union all
select id, 'household_counts', 7, array['guardian','student']::app_role[]
from public.form
where name = 'Household Counts'
union all
select id, 'partner_organization', 8, array['guardian']::app_role[]
from public.form
where name = 'Partner Organization'
union all
select id, 'guardian_consent', 9, array['guardian']::app_role[]
from public.form
where name = 'Guardian Consent'
on conflict (form_id) do update
  set slug = excluded.slug,
      step_order = excluded.step_order,
      roles = excluded.roles;
