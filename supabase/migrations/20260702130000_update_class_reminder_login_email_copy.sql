create or replace function public.update_class_reminder_login_email_copy()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft_id uuid;
  v_version_id uuid;
  v_next_version integer;
  v_subject constant text := 'Reminder: {{workshopName}} starts soon';
  v_body constant text := E'Hi,\n\nYour {{workshopName}} class starts soon.\n\nPlease sign in to SummerLunch+ to join your class:\n\n[Log in to join class]({{loginUrl}})\n\nIf you have trouble accessing your account, reply to this email and our team will help.\n\n- The SummerLunch+ Team';
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
    'class_reminder_login_v1',
    'Class reminder login prompt',
    'Class reminder prompting users to log in before joining class.',
    'Sent up to 2 hours before class start for unsent registrants.',
    'class_zoom_registrant.reminder_login',
    'web/app/lib/zoom-jobs/runner.server.ts',
    'transactional',
    'published',
    true,
    '{"required": ["workshopName", "loginUrl"]}'::jsonb,
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
      'Reminder: {{workshopName}} starts soon',
      '<p>Hi,</p><p>Your {{workshopName}} class starts soon.</p><p>Please sign in to SummerLunch+ to join your class:</p><p><a href="{{loginUrl}}">Log in to join class</a></p><p>If you have trouble accessing your account, reply to this email and our team will help.</p><p>- The SummerLunch+ Team</p>',
      E'Hi,\n\nYour {{workshopName}} class starts soon.\n\nPlease sign in to SummerLunch+ to join your class:\n\n{{loginUrl}}\n\nIf you have trouble accessing your account, reply to this email and our team will help.\n\n- The SummerLunch+ Team',
      '{"required": ["workshopName", "loginUrl"]}'::jsonb,
      'Remove class start timestamp from reminder copy and keep login prompt.',
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

select public.update_class_reminder_login_email_copy();
