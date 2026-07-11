create table public.gift_card_inventory_alert_state (
  provider gift_card_provider primary key,
  is_low boolean not null default false,
  last_inventory_count integer not null default 0,
  last_threshold integer not null default 0,
  last_alerted_at timestamptz,
  last_recovered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (last_inventory_count >= 0),
  check (last_threshold >= 0)
);

create index gift_card_inventory_alert_state_is_low_idx on public.gift_card_inventory_alert_state(is_low);

create or replace function public.touch_gift_card_inventory_alert_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_gift_card_inventory_alert_state_updated_set_timestamp on public.gift_card_inventory_alert_state;
create trigger on_gift_card_inventory_alert_state_updated_set_timestamp
before update on public.gift_card_inventory_alert_state
for each row execute function public.touch_gift_card_inventory_alert_state_updated_at();

alter table public.gift_card_inventory_alert_state enable row level security;

create policy gift_card_inventory_alert_state_manage_staff
  on public.gift_card_inventory_alert_state
  for all
  using (public.current_user_role() in ('admin', 'manager', 'staff'))
  with check (public.current_user_role() in ('admin', 'manager', 'staff'));

create policy gift_card_inventory_alert_state_read_auth_admin
  on public.gift_card_inventory_alert_state
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.gift_card_inventory_alert_state to supabase_auth_admin;
revoke all on table public.gift_card_inventory_alert_state from authenticated, anon, public;
grant select, insert, update, delete on table public.gift_card_inventory_alert_state to authenticated;

create or replace function public.ensure_gift_card_inventory_low_email_draft()
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
    'gift_card_inventory_low_v1',
    'Gift card inventory low alert',
    'Admin/staff alert when gift card inventory falls below configured provider threshold.',
    'Sent once per low-inventory transition for each provider until inventory recovers.',
    'gift_card_inventory.low',
    'web/app/lib/gift-cards/runner.server.ts',
    'transactional',
    'draft',
    true,
    '{"required": ["provider", "availableCount", "threshold", "nearTermDemand", "upcomingDemand", "projectedDemand", "projectedShortfall", "manageUrl"]}'::jsonb,
    'Low gift card inventory alert ({{provider}})',
    E'Gift card inventory is low for {{provider}}.\n\nAvailable: {{availableCount}}\nThreshold: {{threshold}}\nNear-term demand: {{nearTermDemand}}\nUpcoming demand: {{upcomingDemand}}\nProjected demand: {{projectedDemand}}\nProjected shortfall: {{projectedShortfall}}\n\nReview inventory: {{manageUrl}}'
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
    'Low gift card inventory alert ({{provider}})',
    E'Gift card inventory is low for {{provider}}.\n\nAvailable: {{availableCount}}\nThreshold: {{threshold}}\nNear-term demand: {{nearTermDemand}}\nUpcoming demand: {{upcomingDemand}}\nProjected demand: {{projectedDemand}}\nProjected shortfall: {{projectedShortfall}}\n\nReview inventory: {{manageUrl}}',
    'Low gift card inventory alert ({{provider}})',
    '<p>Gift card inventory is low for <strong>{{provider}}</strong>.</p><p>Available: <strong>{{availableCount}}</strong><br />Threshold: <strong>{{threshold}}</strong><br />Near-term demand: <strong>{{nearTermDemand}}</strong><br />Upcoming demand: <strong>{{upcomingDemand}}</strong><br />Projected demand: <strong>{{projectedDemand}}</strong><br />Projected shortfall: <strong>{{projectedShortfall}}</strong></p><p><a href="{{manageUrl}}">Review inventory</a></p>',
    E'Gift card inventory is low for {{provider}}.\n\nAvailable: {{availableCount}}\nThreshold: {{threshold}}\nNear-term demand: {{nearTermDemand}}\nUpcoming demand: {{upcomingDemand}}\nProjected demand: {{projectedDemand}}\nProjected shortfall: {{projectedShortfall}}\n\nReview inventory: {{manageUrl}}',
    '{"required": ["provider", "availableCount", "threshold", "nearTermDemand", "upcomingDemand", "projectedDemand", "projectedShortfall", "manageUrl"]}'::jsonb,
    'Seeded low gift-card inventory alert draft content.',
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

select public.ensure_gift_card_inventory_low_email_draft();
