create or replace function public.ensure_meal_kit_pickup_reminder_email_draft()
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
    'meal_kit_pickup_reminder_v1',
    'Meal kit pickup reminder',
    'Reminder for meal kit families on Tuesday morning pickup window.',
    'Sent Tuesday mornings Toronto time to families with meal kit preference.',
    'meal_kit_pickup.reminder',
    'web/app/lib/gift-cards/runner.server.ts',
    'transactional',
    'draft',
    true,
    '{}'::jsonb,
    'SummerLunch+ meal kit pickup reminder for today',
    E'Hi,\nThis is a friendly reminder that summerlunch+ meal kit pickup is today, Tuesday, at the East York Town Centre.\nPickup Location: Thorncliffe Community Hub - Entrance 6\nPickup Time: Between 1:00 PM and 6:00 PM\nPlease remember to bring reusable bags or a shopping trolley/cart, as the meal kits can be heavy.\nIf you are unable to attend pickup, please let us know as soon as possible by replying to this email.\nWe look forward to seeing you today!\n- The summerlunch+ Team'
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
    'SummerLunch+ meal kit pickup reminder for today',
    E'Hi,\nThis is a friendly reminder that summerlunch+ meal kit pickup is today, Tuesday, at the East York Town Centre.\nPickup Location: Thorncliffe Community Hub - Entrance 6\nPickup Time: Between 1:00 PM and 6:00 PM\nPlease remember to bring reusable bags or a shopping trolley/cart, as the meal kits can be heavy.\nIf you are unable to attend pickup, please let us know as soon as possible by replying to this email.\nWe look forward to seeing you today!\n- The summerlunch+ Team',
    'SummerLunch+ meal kit pickup reminder for today',
    '<p>Hi,<br />This is a friendly reminder that summerlunch+ meal kit pickup is today, Tuesday, at the East York Town Centre.<br />Pickup Location: Thorncliffe Community Hub - Entrance 6<br />Pickup Time: Between 1:00 PM and 6:00 PM<br />Please remember to bring reusable bags or a shopping trolley/cart, as the meal kits can be heavy.<br />If you are unable to attend pickup, please let us know as soon as possible by replying to this email.<br />We look forward to seeing you today!<br />- The summerlunch+ Team</p>',
    E'Hi,\nThis is a friendly reminder that summerlunch+ meal kit pickup is today, Tuesday, at the East York Town Centre.\nPickup Location: Thorncliffe Community Hub - Entrance 6\nPickup Time: Between 1:00 PM and 6:00 PM\nPlease remember to bring reusable bags or a shopping trolley/cart, as the meal kits can be heavy.\nIf you are unable to attend pickup, please let us know as soon as possible by replying to this email.\nWe look forward to seeing you today!\n- The summerlunch+ Team',
    '{}'::jsonb,
    'Seeded meal kit pickup reminder draft content.',
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

select public.ensure_meal_kit_pickup_reminder_email_draft();
