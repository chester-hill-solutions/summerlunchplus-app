alter type public.app_permissions rename value 'session_attendance.create' to 'class_attendance.create';
alter type public.app_permissions rename value 'session_attendance.read' to 'class_attendance.read';
alter type public.app_permissions rename value 'session_attendance.update' to 'class_attendance.update';
alter type public.app_permissions rename value 'session_attendance.delete' to 'class_attendance.delete';

do $$
begin
  if exists (
    select 1 from pg_type where typname = 'session_attendance_status' and typnamespace = 'public'::regnamespace
  ) then
    alter type public.session_attendance_status rename to class_attendance_status;
  end if;
end $$;

alter table if exists public.session rename to class;
alter table if exists public.session_attendance rename to class_attendance;
alter table if exists public.class_attendance rename column session_id to class_id;

drop trigger if exists on_session_attendance_updated_set_timestamp on public.class_attendance;
drop function if exists public.touch_session_attendance_updated_at();
drop function if exists public.touch_session_updated_at();

create or replace function public.touch_class_updated_at()
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

create or replace function public.touch_class_attendance_updated_at()
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

create trigger on_class_attendance_updated_set_timestamp
before update on public.class_attendance
for each row execute function public.touch_class_attendance_updated_at();

drop policy if exists session_select_all on public.class;
drop policy if exists session_insert_admin on public.class;
drop policy if exists session_update_admin on public.class;
drop policy if exists session_delete_admin on public.class;
drop policy if exists session_read_auth_admin on public.class;

drop policy if exists session_attendance_select_admin on public.class_attendance;
drop policy if exists session_attendance_insert_admin on public.class_attendance;
drop policy if exists session_attendance_update_admin on public.class_attendance;
drop policy if exists session_attendance_delete_admin on public.class_attendance;
drop policy if exists session_attendance_read_auth_admin on public.class_attendance;

create policy class_select_all
  on public.class
  for select
  using (true);

create policy class_insert_admin
  on public.class
  for insert
  with check (public.authorize('workshop.create'));

create policy class_update_admin
  on public.class
  for update
  using (public.authorize('workshop.update'))
  with check (public.authorize('workshop.update'));

create policy class_delete_admin
  on public.class
  for delete
  using (public.authorize('workshop.delete'));

create policy class_read_auth_admin
  on public.class
  for select
  to supabase_auth_admin
  using (true);

create policy class_attendance_select_admin
  on public.class_attendance
  for select
  using (public.authorize('class_attendance.read'));

create policy class_attendance_insert_admin
  on public.class_attendance
  for insert
  with check (public.authorize('class_attendance.create'));

create policy class_attendance_update_admin
  on public.class_attendance
  for update
  using (public.authorize('class_attendance.update'))
  with check (public.authorize('class_attendance.update'));

create policy class_attendance_delete_admin
  on public.class_attendance
  for delete
  using (public.authorize('class_attendance.delete'));

create policy class_attendance_read_auth_admin
  on public.class_attendance
  for select
  to supabase_auth_admin
  using (true);

drop policy if exists form_submission_assignee_insert on public.form_submission;
drop policy if exists form_submission_assignee_read on public.form_submission;
drop policy if exists form_answer_assignee_insert on public.form_answer;
drop policy if exists form_answer_assignee_read on public.form_answer;

alter table public.form_submission drop constraint if exists form_submission_form_id_user_id_key;
alter table public.form_submission drop constraint if exists form_submission_user_id_fkey;
alter table public.form_submission drop column if exists user_id;
alter table public.form_submission add column profile_id uuid not null references public.profile (id) on delete cascade;
alter table public.form_submission add constraint form_submission_form_id_profile_id_key unique (form_id, profile_id);

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
      select 1
      from public.form_submission fs
      join public.profile p on p.id = fs.profile_id
      where fs.form_id = fa.form_id
        and p.user_id = fa.user_id
    );
end;
$$;

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
      select 1
      from public.form_submission fs
      join public.profile p on p.id = fs.profile_id
      where fs.form_id = fa.form_id
        and p.user_id = fa.user_id
    );
end;
$$;

create or replace function public.mark_assignment_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise log '[mark_assignment_submitted] enter form % profile %', new.form_id, new.profile_id;
  update public.form_assignment
  set status = 'submitted'
  where form_id = new.form_id
    and user_id in (
      select p.user_id from public.profile p where p.id = new.profile_id
    );
  raise log '[mark_assignment_submitted] updated assignment to submitted';
  return new;
end;
$$;

create or replace function public.promote_user_after_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role_current app_role;
  has_completed boolean;
  user_id_current uuid;
begin
  select user_id into user_id_current from public.profile where id = new.profile_id;
  raise log '[promote_user_after_submission] enter user % form %', user_id_current, new.form_id;

  if user_id_current is null then
    raise log '[promote_user_after_submission] skip: missing user for profile %', new.profile_id;
    return new;
  end if;

  if not public.should_auto_promote_onboarding() then
    raise log '[promote_user_after_submission] skip: onboarding_mode=permission for user %', user_id_current;
    return new;
  end if;

  update public.form_assignment
  set status = 'submitted'
  where form_id = new.form_id
    and user_id = user_id_current;

  select coalesce(role, 'unassigned'::app_role)
    into user_role_current
    from public.user_roles
    where user_id = user_id_current;

  if user_role_current is distinct from 'unassigned' then
    raise log '[promote_user_after_submission] skip: role is % for user %', user_role_current, user_id_current;
    return new;
  end if;

  select coalesce(public.has_completed_required_forms(user_id_current), false) into has_completed;
  raise log '[promote_user_after_submission] eval user %, current_role %, has_completed %', user_id_current, user_role_current, has_completed;

  if has_completed then
    update public.user_roles
    set role = 'student'
    where user_id = user_id_current;
    raise log '[promote_user_after_submission] promoted user % to student', user_id_current;
  end if;

  return new;
end;
$$;

create policy form_submission_assignee_insert
  on public.form_submission
  for insert
  with check (
    profile_id in (
      select p.id from public.profile p where p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.form_assignment fa
      where fa.form_id = form_submission.form_id
        and fa.user_id = auth.uid()
    )
  );

create policy form_submission_assignee_read
  on public.form_submission
  for select
  using (
    profile_id in (
      select p.id from public.profile p where p.user_id = auth.uid()
    )
  );

create policy form_answer_assignee_insert
  on public.form_answer
  for insert
  with check (
    exists (
      select 1 from public.form_submission fs
      where fs.id = form_answer.submission_id
        and fs.profile_id in (
          select p.id from public.profile p where p.user_id = auth.uid()
        )
    )
  );

create policy form_answer_assignee_read
  on public.form_answer
  for select
  using (exists (
    select 1 from public.form_submission fs
    where fs.id = form_answer.submission_id
      and fs.profile_id in (
        select p.id from public.profile p where p.user_id = auth.uid()
      )
  ));
