create type public.email_draft_channel as enum ('transactional', 'auth');

create type public.email_draft_status as enum ('draft', 'published', 'archived');

create table public.email_draft (
  id uuid primary key default gen_random_uuid(),
  draft_key text not null unique,
  title text not null,
  description text,
  trigger_summary text not null default '',
  trigger_event_key text,
  trigger_owner text,
  channel public.email_draft_channel not null,
  status public.email_draft_status not null default 'draft',
  is_system boolean not null default false,
  variables_schema jsonb not null default '{}'::jsonb,
  current_subject_markdown text not null default '',
  current_body_markdown text not null default '',
  published_version_id uuid,
  created_by_user_id uuid references auth.users (id) on delete set null,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_draft_trigger_summary_length_check check (char_length(trigger_summary) <= 200),
  constraint email_draft_trigger_summary_required_for_transactional
    check (channel <> 'transactional' or char_length(btrim(trigger_summary)) > 0)
);

create table public.email_draft_version (
  id uuid primary key default gen_random_uuid(),
  email_draft_id uuid not null references public.email_draft (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  subject_markdown text not null,
  body_markdown text not null,
  subject_rendered text not null,
  html_rendered text not null,
  text_rendered text not null,
  variables_schema jsonb not null default '{}'::jsonb,
  change_note text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by_user_id uuid references auth.users (id) on delete set null,
  unique (email_draft_id, version_number)
);

alter table public.email_draft
  add constraint email_draft_published_version_id_fkey
  foreign key (published_version_id) references public.email_draft_version (id) on delete set null;

create index email_draft_channel_status_idx on public.email_draft (channel, status);
create index email_draft_updated_at_idx on public.email_draft (updated_at desc);
create index email_draft_version_draft_created_idx on public.email_draft_version (email_draft_id, created_at desc);

create or replace function public.touch_email_draft_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_email_draft_updated_set_timestamp on public.email_draft;
create trigger on_email_draft_updated_set_timestamp
before update on public.email_draft
for each row execute function public.touch_email_draft_updated_at();

alter table public.email_draft enable row level security;
alter table public.email_draft_version enable row level security;

create policy email_draft_read
  on public.email_draft
  for select
  using (public.authorize('form.read'));

create policy email_draft_insert
  on public.email_draft
  for insert
  with check (public.authorize('form.update'));

create policy email_draft_update
  on public.email_draft
  for update
  using (public.authorize('form.update'))
  with check (public.authorize('form.update'));

create policy email_draft_delete
  on public.email_draft
  for delete
  using (public.authorize('form.update') and not is_system);

create policy email_draft_version_read
  on public.email_draft_version
  for select
  using (public.authorize('form.read'));

create policy email_draft_version_insert
  on public.email_draft_version
  for insert
  with check (public.authorize('form.update'));

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

grant usage on type public.email_draft_channel to authenticated, supabase_auth_admin;
grant usage on type public.email_draft_status to authenticated, supabase_auth_admin;

grant all on table public.email_draft to supabase_auth_admin;
revoke all on table public.email_draft from anon, public;
grant select, insert, update, delete on table public.email_draft to authenticated;

grant all on table public.email_draft_version to supabase_auth_admin;
revoke all on table public.email_draft_version from anon, public;
grant select, insert on table public.email_draft_version to authenticated;
