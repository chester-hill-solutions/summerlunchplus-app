create or replace function public.update_class_camera_or_photo_followup_email_copy()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft_id uuid;
  v_version_id uuid;
  v_next_version integer;
  v_subject constant text := 'Please upload your class recipe photo in the SummerLunch+ Hub';
  v_body constant text := E'Hi {{guardianName}},\n\nThanks for being part of today''s summerlunch+ class.\n\nTo confirm participation for today''s session, please upload a photo of your completed recipe in the SummerLunch+ Hub:\n\n1. Log in to your SummerLunch+ account\n2. Go to the Workshops section\n3. Find today''s class and click Upload Images\n4. Select your photo(s) and submit\n\nPlease do not reply to this email, as this inbox is not monitored.\n\nThank you!\n\n- The summerlunch+ Team';
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
    'published',
    true,
    '{"required": ["guardianName"]}'::jsonb,
    v_subject,
    v_body
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
      status = 'published',
      is_system = true,
      variables_schema = excluded.variables_schema,
      current_subject_markdown = excluded.current_subject_markdown,
      current_body_markdown = excluded.current_body_markdown
  returning id into v_draft_id;

  select version.id
    into v_version_id
  from public.email_draft_version as version
  where version.email_draft_id = v_draft_id
    and version.subject_markdown = v_subject
    and version.body_markdown = v_body
  order by version.version_number desc
  limit 1;

  if v_version_id is null then
    select coalesce(max(version.version_number), 0) + 1
      into v_next_version
    from public.email_draft_version as version
    where version.email_draft_id = v_draft_id;

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
      v_next_version,
      v_subject,
      v_body,
      v_subject,
      '<p>Hi {{guardianName}},</p><p>Thanks for being part of today''s summerlunch+ class.</p><p>To confirm participation for today''s session, please upload a photo of your completed recipe in the SummerLunch+ Hub:</p><ol><li>Log in to your SummerLunch+ account</li><li>Go to the Workshops section</li><li>Find today''s class and click Upload Images</li><li>Select your photo(s) and submit</li></ol><p>Please do not reply to this email, as this inbox is not monitored.</p><p>Thank you!</p><p>- The summerlunch+ Team</p>',
      E'Hi {{guardianName}},\n\nThanks for being part of today''s summerlunch+ class.\n\nTo confirm participation for today''s session, please upload a photo of your completed recipe in the SummerLunch+ Hub:\n\n1. Log in to your SummerLunch+ account\n2. Go to the Workshops section\n3. Find today''s class and click Upload Images\n4. Select your photo(s) and submit\n\nPlease do not reply to this email, as this inbox is not monitored.\n\nThank you!\n\n- The summerlunch+ Team',
      '{"required": ["guardianName"]}'::jsonb,
      'Clarify no-reply mailbox and direct families to upload in Hub Workshops section.',
      now()
    )
    returning id into v_version_id;
  end if;

  update public.email_draft
  set
    published_version_id = v_version_id,
    status = 'published',
    current_subject_markdown = v_subject,
    current_body_markdown = v_body
  where id = v_draft_id;
end;
$$;

select public.update_class_camera_or_photo_followup_email_copy();
