create or replace function public.ensure_class_camera_or_photo_followup_email_draft()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft_id uuid;
  v_version_id uuid;
begin
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
    'class_camera_or_photo_followup_v1',
    'Class follow-up: camera/photo confirmation',
    '24-hour post-class follow-up for participants missing camera-on or photo status.',
    'Sent 24 hours after class end when camera was off/missing and no photo status exists.',
    'class_attendance.post_class_camera_or_photo_followup',
    'web/app/lib/zoom-jobs/runner.server.ts',
    'transactional',
    'draft',
    true,
    '{"required": ["guardianName"]}'::jsonb,
    'Photo needed to confirm class participation',
    E'Hi {{guardianName}},\n\nThanks for being part of today''s summerlunch+ class!\n\nIt seems like your camera was turned off during class if you experienced any connectivity issues, please send us a photo of your completed recipe so we can confirm participation for today''s session.\n\nYou can reply directly to this email with your photo attached.\n\nThank you, and we hope you enjoyed cooking with us!\n\n- The summerlunch+ Team'
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
  returning id into v_draft_id;

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
  values (
    v_draft_id,
    1,
    'Photo needed to confirm class participation',
    E'Hi {{guardianName}},\n\nThanks for being part of today''s summerlunch+ class!\n\nIt seems like your camera was turned off during class if you experienced any connectivity issues, please send us a photo of your completed recipe so we can confirm participation for today''s session.\n\nYou can reply directly to this email with your photo attached.\n\nThank you, and we hope you enjoyed cooking with us!\n\n- The summerlunch+ Team',
    'Photo needed to confirm class participation',
    '<p>Hi {{guardianName}},</p><p>Thanks for being part of today''s summerlunch+ class!</p><p>It seems like your camera was turned off during class if you experienced any connectivity issues, please send us a photo of your completed recipe so we can confirm participation for today''s session.</p><p>You can reply directly to this email with your photo attached.</p><p>Thank you, and we hope you enjoyed cooking with us!</p><p>- The summerlunch+ Team</p>',
    E'Hi {{guardianName}},\n\nThanks for being part of today''s summerlunch+ class!\n\nIt seems like your camera was turned off during class if you experienced any connectivity issues, please send us a photo of your completed recipe so we can confirm participation for today''s session.\n\nYou can reply directly to this email with your photo attached.\n\nThank you, and we hope you enjoyed cooking with us!\n\n- The summerlunch+ Team',
    '{"required": ["guardianName"]}'::jsonb,
    'Seeded class camera/photo follow-up draft content.',
    now()
  )
  on conflict (email_draft_id, version_number) do nothing;

  if exists (
    select 1
    from public.email_draft
    where id = v_draft_id
      and published_version_id is null
  ) then
    select version.id
      into v_version_id
    from public.email_draft_version as version
    where version.email_draft_id = v_draft_id
    order by version.version_number desc
    limit 1;

    update public.email_draft
    set
      published_version_id = v_version_id,
      status = 'published'
    where id = v_draft_id;
  end if;
end;
$$;

select public.ensure_class_camera_or_photo_followup_email_draft();
