set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.ensure_gift_card_inventory_low_email_draft()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'gift_card_inventory_low_v1',
    'Gift card inventory low alert',
    'Admin/staff alert when available cards cannot cover qualified attendance this week or next week.',
    'Sent at 9 AM and 9 PM Toronto time when a provider has a current or upcoming weekly shortfall.',
    'gift_card_inventory.low',
    'web/app/lib/gift-cards/runner.server.ts',
    'transactional',
    'draft',
    true,
    '{"required": ["provider", "availableCount", "thisWeekLabel", "thisWeekNeeded", "thisWeekShortfall", "upcomingWeekLabel", "upcomingWeekNeeded", "upcomingWeekShortfall", "manageUrl"]}'::jsonb,
    'Gift card shortfall alert ({{provider}})',
    E'Gift card inventory cannot cover upcoming qualified attendance for {{provider}}.\n\nAvailable: {{availableCount}}\nThis week ({{thisWeekLabel}}) still needed: {{thisWeekNeeded}}\nThis week shortfall: {{thisWeekShortfall}}\nUpcoming week ({{upcomingWeekLabel}}) still needed: {{upcomingWeekNeeded}}\nUpcoming week shortfall: {{upcomingWeekShortfall}}\n\nReview inventory: {{manageUrl}}'
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
    'Gift card shortfall alert ({{provider}})',
    E'Gift card inventory cannot cover upcoming qualified attendance for {{provider}}.\n\nAvailable: {{availableCount}}\nThis week ({{thisWeekLabel}}) still needed: {{thisWeekNeeded}}\nThis week shortfall: {{thisWeekShortfall}}\nUpcoming week ({{upcomingWeekLabel}}) still needed: {{upcomingWeekNeeded}}\nUpcoming week shortfall: {{upcomingWeekShortfall}}\n\nReview inventory: {{manageUrl}}',
    'Gift card shortfall alert ({{provider}})',
    '<p>Gift card inventory cannot cover upcoming qualified attendance for <strong>{{provider}}</strong>.</p><p>Available: <strong>{{availableCount}}</strong><br />This week ({{thisWeekLabel}}) still needed: <strong>{{thisWeekNeeded}}</strong><br />This week shortfall: <strong>{{thisWeekShortfall}}</strong><br />Upcoming week ({{upcomingWeekLabel}}) still needed: <strong>{{upcomingWeekNeeded}}</strong><br />Upcoming week shortfall: <strong>{{upcomingWeekShortfall}}</strong></p><p><a href="{{manageUrl}}">Review inventory</a></p>',
    E'Gift card inventory cannot cover upcoming qualified attendance for {{provider}}.\n\nAvailable: {{availableCount}}\nThis week ({{thisWeekLabel}}) still needed: {{thisWeekNeeded}}\nThis week shortfall: {{thisWeekShortfall}}\nUpcoming week ({{upcomingWeekLabel}}) still needed: {{upcomingWeekNeeded}}\nUpcoming week shortfall: {{upcomingWeekShortfall}}\n\nReview inventory: {{manageUrl}}',
    '{"required": ["provider", "availableCount", "thisWeekLabel", "thisWeekNeeded", "thisWeekShortfall", "upcomingWeekLabel", "upcomingWeekNeeded", "upcomingWeekShortfall", "manageUrl"]}'::jsonb,
    'Seeded gift-card shortfall alert draft content.',
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
$function$
;

