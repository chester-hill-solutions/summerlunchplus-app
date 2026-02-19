-- Forms schema: questions, assignments, submissions, and helpers for auto-assign/onboarding.

create type form_question_type as enum (
  'text',
  'single_choice',
  'multi_choice',
  'date',
  'address'
);

create type form_assignment_status as enum (
  'pending',
  'submitted'
);

create table public.form (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  due_at timestamptz,
  is_required boolean not null default true,
  auto_assign app_role[] not null default '{}'::app_role[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table public.form_question (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.form (id) on delete cascade,
  prompt text not null,
  kind form_question_type not null,
  position integer not null,
  options jsonb not null default '[]'::jsonb,
  unique (form_id, position)
);

create table public.form_assignment (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.form (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id),
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  status form_assignment_status not null default 'pending',
  unique (form_id, user_id)
);

create table public.form_submission (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.form (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  unique (form_id, user_id)
);

create table public.form_answer (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submission (id) on delete cascade,
  question_id uuid not null references public.form_question (id) on delete cascade,
  value jsonb not null,
  unique (submission_id, question_id)
);

-- Timestamps.
create or replace function public.touch_form_updated_at()
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

drop trigger if exists on_form_updated_set_timestamp on public.form;
create trigger on_form_updated_set_timestamp
before update on public.form
for each row execute function public.touch_form_updated_at();

-- Auto-assign sync helpers.
create or replace function public.sync_auto_assigned_forms_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role app_role;
begin
  select role into user_role from public.user_roles where user_id = p_user_id;
  user_role := coalesce(user_role, 'unassigned'::app_role);

  insert into public.form_assignment (form_id, user_id, assigned_by)
  select f.id, p_user_id, null
  from public.form f
  where user_role = any (f.auto_assign)
  on conflict (form_id, user_id) do nothing;

  delete from public.form_assignment fa
  where fa.user_id = p_user_id
    and fa.form_id in (
      select f.id
      from public.form f
      where not (user_role = any (f.auto_assign))
    )
    and not exists (
      select 1 from public.form_submission fs
      where fs.form_id = fa.form_id
        and fs.user_id = fa.user_id
    );
end;
$$;

create or replace function public.sync_auto_assigned_forms_for_user_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_auto_assigned_forms_for_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists on_user_role_changed_sync_forms on public.user_roles;
create trigger on_user_role_changed_sync_forms
after insert or update on public.user_roles
for each row execute function public.sync_auto_assigned_forms_for_user_trigger();

create or replace function public.sync_auto_assigned_forms_for_form(p_form_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.form_assignment (form_id, user_id, assigned_by)
  select f.id, ur.user_id, null
  from public.form f
  join public.user_roles ur on ur.role = any (f.auto_assign)
  where f.id = p_form_id
  on conflict (form_id, user_id) do nothing;

  delete from public.form_assignment fa
  where fa.form_id = p_form_id
    and not exists (
      select 1
      from public.form f
      join public.user_roles ur on ur.user_id = fa.user_id
      where f.id = fa.form_id
        and ur.role = any (f.auto_assign)
    )
    and not exists (
      select 1 from public.form_submission fs
      where fs.form_id = fa.form_id
        and fs.user_id = fa.user_id
    );
end;
$$;

create or replace function public.sync_auto_assigned_forms_for_form_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_auto_assigned_forms_for_form(new.id);
  return new;
end;
$$;

drop trigger if exists on_form_auto_assign_changed_sync_assignments on public.form;
create trigger on_form_auto_assign_changed_sync_assignments
after update of auto_assign on public.form
for each row execute function public.sync_auto_assigned_forms_for_form_trigger();

drop trigger if exists on_form_created_sync_assignments on public.form;
create trigger on_form_created_sync_assignments
after insert on public.form
for each row execute function public.sync_auto_assigned_forms_for_form_trigger();

-- Mark assignments as submitted when a submission is created.
create or replace function public.mark_assignment_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.form_assignment
  set status = 'submitted'
  where form_id = new.form_id
    and user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_form_submission_mark_assignment on public.form_submission;
create trigger on_form_submission_mark_assignment
after insert on public.form_submission
for each row execute function public.mark_assignment_submitted();

-- Onboarding completion helper used by role/permission claims and auto-promotion.
create or replace function public.has_completed_required_forms(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with required_assignments as (
    select fa.form_id
    from public.form_assignment fa
    join public.form f on f.id = fa.form_id
    where fa.user_id = p_user_id
      and f.is_required = true
  )
  select case
    when not exists (select 1 from required_assignments) then false
    when exists (
      select 1 from required_assignments ra
      left join public.form_submission fs on fs.form_id = ra.form_id and fs.user_id = p_user_id
      where fs.id is null
    ) then false
    else true
  end;
$$;

create or replace function public.should_auto_promote_onboarding()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(current_setting('app.onboarding_mode', true), ''), 'role') <> 'permission';
$$;

-- Promote unassigned users after completing required forms (Option A default; guardable by ONBOARDING_MODE).
create or replace function public.promote_user_after_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role app_role;
begin
  if not public.should_auto_promote_onboarding() then
    return new;
  end if;

  select role into current_role from public.user_roles where user_id = new.user_id;
  if current_role is distinct from 'unassigned' then
    return new;
  end if;

  if public.has_completed_required_forms(new.user_id) then
    update public.user_roles
    set role = 'student'
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_form_submission_auto_promote on public.form_submission;
create trigger on_form_submission_auto_promote
after insert on public.form_submission
for each row execute function public.promote_user_after_submission();

-- Access token hook (adds user_role, permissions, onboarding_complete claims).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
  declare
    claims jsonb;
    user_role app_role;
    permissions jsonb;
    onboarding_complete boolean;
  begin
    select role into user_role from public.user_roles where user_id = (event->>'user_id')::uuid;
    select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
      into permissions
      from public.role_permission rp
      where rp.role = coalesce(user_role, 'unassigned'::app_role);

    select coalesce(public.has_completed_required_forms((event->>'user_id')::uuid), false)
      into onboarding_complete;

    claims := coalesce(event->'claims', '{}'::jsonb);
    claims := jsonb_set(
      claims,
      '{user_role}',
      to_jsonb(coalesce(user_role, 'unassigned'::app_role))
    );
    claims := jsonb_set(
      claims,
      '{permissions}',
      permissions
    );
    claims := jsonb_set(
      claims,
      '{onboarding_complete}',
      to_jsonb(onboarding_complete)
    );
    event := jsonb_set(event, '{claims}', claims);
    return event;
  end;
$$;

-- RLS
alter table public.form enable row level security;
alter table public.form_question enable row level security;
alter table public.form_assignment enable row level security;
alter table public.form_submission enable row level security;
alter table public.form_answer enable row level security;

-- Admin/manager manage forms and related objects.
create policy form_admin_manage
  on public.form
  for all
  using (auth.jwt()->>'user_role' in ('admin','manager'))
  with check (auth.jwt()->>'user_role' in ('admin','manager'));

create policy form_question_admin_manage
  on public.form_question
  for all
  using (auth.jwt()->>'user_role' in ('admin','manager'))
  with check (auth.jwt()->>'user_role' in ('admin','manager'));

create policy form_assignment_admin_manage
  on public.form_assignment
  for all
  using (auth.jwt()->>'user_role' in ('admin','manager'))
  with check (auth.jwt()->>'user_role' in ('admin','manager'));

create policy form_submission_admin_manage
  on public.form_submission
  for all
  using (auth.jwt()->>'user_role' in ('admin','manager'))
  with check (auth.jwt()->>'user_role' in ('admin','manager'));

create policy form_answer_admin_manage
  on public.form_answer
  for all
  using (auth.jwt()->>'user_role' in ('admin','manager'))
  with check (auth.jwt()->>'user_role' in ('admin','manager'));

-- Supabase auth hook read access.
create policy form_read_auth_admin
  on public.form
  for select
  to supabase_auth_admin
  using (true);

create policy form_question_read_auth_admin
  on public.form_question
  for select
  to supabase_auth_admin
  using (true);

create policy form_assignment_read_auth_admin
  on public.form_assignment
  for select
  to supabase_auth_admin
  using (true);

create policy form_submission_read_auth_admin
  on public.form_submission
  for select
  to supabase_auth_admin
  using (true);

create policy form_answer_read_auth_admin
  on public.form_answer
  for select
  to supabase_auth_admin
  using (true);

-- Assignee access.
create or replace function public.assignee_can_read_form(p_form_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.form_assignment fa
    where fa.form_id = p_form_id
      and fa.user_id = auth.uid()
  );
$$;

drop policy if exists form_assignee_read on public.form;
create policy form_assignee_read
  on public.form
  for select
  using (public.assignee_can_read_form(id));

create policy form_question_assignee_read
  on public.form_question
  for select
  using (exists (
    select 1 from public.form_assignment fa
    where fa.form_id = form_question.form_id and fa.user_id = auth.uid()
  ));

create policy form_assignment_assignee_read
  on public.form_assignment
  for select
  using (user_id = auth.uid());

create policy form_assignment_self_insert
  on public.form_assignment
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.form f
      where f.id = form_assignment.form_id
        and (auth.jwt()->>'user_role')::app_role = any (f.auto_assign)
    )
  );

grant execute on function public.sync_auto_assigned_forms_for_user(uuid) to authenticated;
grant execute on function public.sync_auto_assigned_forms_for_form(uuid) to authenticated;

create policy form_submission_assignee_insert
  on public.form_submission
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.form_assignment fa
      where fa.form_id = form_submission.form_id
        and fa.user_id = auth.uid()
    )
  );

create policy form_submission_assignee_read
  on public.form_submission
  for select
  using (user_id = auth.uid());

create policy form_answer_assignee_insert
  on public.form_answer
  for insert
  with check (
    exists (
      select 1 from public.form_submission fs
      where fs.id = form_answer.submission_id
        and fs.user_id = auth.uid()
    )
  );

create policy form_answer_assignee_read
  on public.form_answer
  for select
  using (exists (
    select 1 from public.form_submission fs
    where fs.id = form_answer.submission_id
      and fs.user_id = auth.uid()
  ));

create policy form_assignment_assignee_update_status
  on public.form_assignment
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Grants
grant all on table public.form to supabase_auth_admin;
grant all on table public.form_question to supabase_auth_admin;
grant all on table public.form_assignment to supabase_auth_admin;
grant all on table public.form_submission to supabase_auth_admin;
grant all on table public.form_answer to supabase_auth_admin;

revoke all on table public.form from authenticated, anon, public;
revoke all on table public.form_question from authenticated, anon, public;
revoke all on table public.form_assignment from authenticated, anon, public;
revoke all on table public.form_submission from authenticated, anon, public;
revoke all on table public.form_answer from authenticated, anon, public;

grant all on table public.form to authenticated;
grant all on table public.form_question to authenticated;
grant all on table public.form_assignment to authenticated;
grant all on table public.form_submission to authenticated;
grant all on table public.form_answer to authenticated;

grant usage on type form_question_type to authenticated, supabase_auth_admin;
grant usage on type form_assignment_status to authenticated, supabase_auth_admin;
grant execute on function public.sync_auto_assigned_forms_for_user(uuid) to authenticated;
grant execute on function public.sync_auto_assigned_forms_for_form(uuid) to authenticated;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
