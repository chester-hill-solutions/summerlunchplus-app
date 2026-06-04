alter table public.email_draft
  add column if not exists trigger_summary text not null default '',
  add column if not exists trigger_event_key text,
  add column if not exists trigger_owner text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_draft_trigger_summary_length_check'
      and conrelid = 'public.email_draft'::regclass
  ) then
    alter table public.email_draft
      add constraint email_draft_trigger_summary_length_check
      check (char_length(trigger_summary) <= 200);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_draft_trigger_summary_required_for_transactional'
      and conrelid = 'public.email_draft'::regclass
  ) then
    alter table public.email_draft
      add constraint email_draft_trigger_summary_required_for_transactional
      check (channel <> 'transactional' or char_length(btrim(trigger_summary)) > 0);
  end if;
end;
$$;

with upsert_requested as (
  insert into public.email_draft (
    draft_key,
    title,
    description,
    trigger_summary,
    trigger_event_key,
    trigger_owner,
    channel,
    status,
    is_system,
    variables_schema,
    current_subject_markdown,
    current_body_markdown
  )
  values (
    'family_enrollment_requested_v1',
    'Family enrollment requested',
    'Family enrollment request notification.',
    'Sent to each family email immediately after enrollment is requested.',
    'workshop_enrollment.family_requested',
    'web/app/routes/enroll.tsx',
    'transactional',
    'draft',
    true,
    '{"required": ["actorName", "actorEmail", "workshopName"]}'::jsonb,
    'We''ve received your summerlunch+ registration!',
    E'Hi,\n\nThank you for registering for summerlunch+! We''re excited to welcome your family this summer.\n\nYour registration has been received and is currently pending approval. Our team will review your information and send you a confirmation email shortly with your program details, class schedule, and next steps.\n\nWhile you wait, we encourage you to invite additional family members to join your profile.\n\nAs a reminder, to help maintain a safe and engaging class environment, all participants must be supervised by a parent or guardian during classes and are expected to keep their cameras on throughout the session.\n\nRegistration details:\n- Registered by: {{actorName}} ({{actorEmail}})\n- Workshop: {{workshopName}}\n\nIf you have any questions in the meantime, feel free to email us at hello@summerlunchplus.com.\n\nWe''re looking forward to cooking with you soon!\n\n- The summerlunch+ Team'
  )
  on conflict (draft_key)
  do update
    set
      title = excluded.title,
      description = excluded.description,
      trigger_summary = excluded.trigger_summary,
      trigger_event_key = excluded.trigger_event_key,
      trigger_owner = excluded.trigger_owner,
      channel = excluded.channel,
      is_system = true,
      variables_schema = case
        when public.email_draft.variables_schema = '{}'::jsonb then excluded.variables_schema
        else public.email_draft.variables_schema
      end,
      current_subject_markdown = case
        when char_length(btrim(public.email_draft.current_subject_markdown)) = 0 then excluded.current_subject_markdown
        else public.email_draft.current_subject_markdown
      end,
      current_body_markdown = case
        when char_length(btrim(public.email_draft.current_body_markdown)) = 0 then excluded.current_body_markdown
        else public.email_draft.current_body_markdown
      end
  returning id
),
upsert_accepted as (
  insert into public.email_draft (
    draft_key,
    title,
    description,
    trigger_summary,
    trigger_event_key,
    trigger_owner,
    channel,
    status,
    is_system,
    variables_schema,
    current_subject_markdown,
    current_body_markdown
  )
  values (
    'family_enrollment_accepted_v1',
    'Family enrollment accepted',
    'Family enrollment approved notification.',
    'Sent to family emails when staff changes enrollment status to approved.',
    'workshop_enrollment.family_accepted',
    'web/app/routes/manage/workshop-enrollment.tsx',
    'transactional',
    'draft',
    true,
    '{"required": ["workshopName"]}'::jsonb,
    'Family enrollment accepted',
    E'Great news! Your family enrollment for {{workshopName}} has been accepted.\n\nWe look forward to seeing your family in the program.'
  )
  on conflict (draft_key)
  do update
    set
      title = excluded.title,
      description = excluded.description,
      trigger_summary = excluded.trigger_summary,
      trigger_event_key = excluded.trigger_event_key,
      trigger_owner = excluded.trigger_owner,
      channel = excluded.channel,
      is_system = true,
      variables_schema = case
        when public.email_draft.variables_schema = '{}'::jsonb then excluded.variables_schema
        else public.email_draft.variables_schema
      end,
      current_subject_markdown = case
        when char_length(btrim(public.email_draft.current_subject_markdown)) = 0 then excluded.current_subject_markdown
        else public.email_draft.current_subject_markdown
      end,
      current_body_markdown = case
        when char_length(btrim(public.email_draft.current_body_markdown)) = 0 then excluded.current_body_markdown
        else public.email_draft.current_body_markdown
      end
  returning id
)
select 1
from upsert_requested
cross join upsert_accepted;

insert into public.email_draft_version (
  email_draft_id,
  version_number,
  subject_markdown,
  body_markdown,
  subject_rendered,
  html_rendered,
  text_rendered,
  variables_schema,
  change_note,
  published_at
)
select
  draft.id,
  1,
  draft.current_subject_markdown,
  draft.current_body_markdown,
  draft.current_subject_markdown,
  '<p>' || replace(replace(replace(draft.current_body_markdown, '&', '&amp;'), '<', '&lt;'), E'\n', '<br />') || '</p>',
  draft.current_body_markdown,
  draft.variables_schema,
  'Seeded transactional draft content for migration.',
  now()
from public.email_draft as draft
where draft.draft_key in ('family_enrollment_requested_v1', 'family_enrollment_accepted_v1')
  and draft.published_version_id is null
on conflict (email_draft_id, version_number) do nothing;

update public.email_draft as draft
set
  published_version_id = (
    select version.id
    from public.email_draft_version as version
    where version.email_draft_id = draft.id
    order by version.version_number desc
    limit 1
  ),
  status = 'published'
where draft.draft_key in ('family_enrollment_requested_v1', 'family_enrollment_accepted_v1')
  and draft.published_version_id is null;
