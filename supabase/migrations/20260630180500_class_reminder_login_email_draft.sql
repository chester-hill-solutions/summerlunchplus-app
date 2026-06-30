create or replace function public.ensure_class_reminder_login_email_draft()
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
    'class_reminder_login_v1',
    'Class reminder login prompt',
    'Class reminder prompting users to log in before joining class.',
    'Sent up to 2 hours before class start for unsent registrants.',
    'class_zoom_registrant.reminder_login',
    'web/app/lib/zoom-jobs/runner.server.ts',
    'transactional',
    'draft',
    true,
    '{"required": ["workshopName", "classStartsAt", "loginUrl"]}'::jsonb,
    'Reminder: {{workshopName}} starts soon',
    E'Hi,\n\nYour {{workshopName}} class starts at **{{classStartsAt}}**.\n\nPlease sign in to SummerLunch+ to join your class:\n\n[Log in to join class]({{loginUrl}})\n\nIf you have trouble accessing your account, reply to this email and our team will help.\n\n- The SummerLunch+ Team'
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
    'Reminder: {{workshopName}} starts soon',
    E'Hi,\n\nYour {{workshopName}} class starts at **{{classStartsAt}}**.\n\nPlease sign in to SummerLunch+ to join your class:\n\n[Log in to join class]({{loginUrl}})\n\nIf you have trouble accessing your account, reply to this email and our team will help.\n\n- The SummerLunch+ Team',
    'Reminder: {{workshopName}} starts soon',
    '<p>Hi,<br /><br />Your {{workshopName}} class starts at <strong>{{classStartsAt}}</strong>.<br /><br />Please sign in to SummerLunch+ to join your class:<br /><br /><a href="{{loginUrl}}">Log in to join class</a><br /><br />If you have trouble accessing your account, reply to this email and our team will help.<br /><br />- The SummerLunch+ Team</p>',
    E'Hi,\n\nYour {{workshopName}} class starts at {{classStartsAt}}.\n\nPlease sign in to SummerLunch+ to join your class:\n\n{{loginUrl}}\n\nIf you have trouble accessing your account, reply to this email and our team will help.\n\n- The SummerLunch+ Team',
    '{"required": ["workshopName", "classStartsAt", "loginUrl"]}'::jsonb,
    'Seeded class reminder login draft content.',
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

select public.ensure_class_reminder_login_email_draft();
