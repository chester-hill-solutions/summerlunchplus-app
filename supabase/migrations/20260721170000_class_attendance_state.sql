do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'class_attendance_state'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.class_attendance_state as enum ('active', 'inactive');
  end if;
end
$$;

alter table public.class_attendance
  add column if not exists state public.class_attendance_state;

update public.class_attendance
set state = 'active'
where state is null;

alter table public.class_attendance
  alter column state set default 'active',
  alter column state set not null;

alter table public.class_attendance
  add column if not exists inactive_at timestamptz,
  add column if not exists inactive_by uuid references auth.users (id) on update cascade on delete set null,
  add column if not exists inactive_reason text;

alter table public.class_attendance
  drop constraint if exists class_attendance_state_metadata_check;

alter table public.class_attendance
  add constraint class_attendance_state_metadata_check
  check (
    (state = 'active' and inactive_at is null and inactive_by is null and inactive_reason is null)
    or (state = 'inactive' and inactive_at is not null and nullif(btrim(coalesce(inactive_reason, '')), '') is not null)
  );

create index if not exists class_attendance_state_created_idx
  on public.class_attendance (state, created_at desc);

create or replace function public.ensure_class_attendance_rows()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.class_attendance (class_id, profile_id, status)
  select c.id, we.profile_id, null
  from public.class c
  join public.workshop_enrollment we on we.workshop_id = c.workshop_id
  where c.starts_at <= now() + interval '36 hours'
    and we.status = 'approved'
  on conflict (class_id, profile_id)
  do update
    set state = 'active',
        inactive_at = null,
        inactive_by = null,
        inactive_reason = null;
end;
$$;

create or replace function public.audit_class_attendance_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
  v_actor_user_id uuid := auth.uid();
  v_actor_role text := coalesce(v_claims ->> 'user_role', v_claims ->> 'role');
  v_source text := 'unknown';
  v_recorded_by_before uuid := null;
  v_recorded_by_after uuid := null;
  v_class_attendance_id uuid := null;
  v_class_id uuid := null;
  v_profile_id uuid := null;
  v_changed_fields jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then
    v_recorded_by_before := old.recorded_by;
    v_class_attendance_id := old.id;
    v_class_id := old.class_id;
    v_profile_id := old.profile_id;
    v_changed_fields := jsonb_build_object(
      'state', jsonb_build_object('old', old.state, 'new', null),
      'inactive_at', jsonb_build_object('old', old.inactive_at, 'new', null),
      'inactive_by', jsonb_build_object('old', old.inactive_by, 'new', null),
      'inactive_reason', jsonb_build_object('old', old.inactive_reason, 'new', null),
      'status', jsonb_build_object('old', old.status, 'new', null),
      'photo_status', jsonb_build_object('old', old.photo_status, 'new', null),
      'camera_on', jsonb_build_object('old', old.camera_on, 'new', null),
      'gift_card_blocked', jsonb_build_object('old', old.gift_card_blocked, 'new', null),
      'gift_card_block_reason', jsonb_build_object('old', old.gift_card_block_reason, 'new', null),
      'gift_card_blocked_at', jsonb_build_object('old', old.gift_card_blocked_at, 'new', null),
      'gift_card_blocked_by', jsonb_build_object('old', old.gift_card_blocked_by, 'new', null),
      'recorded_by', jsonb_build_object('old', old.recorded_by, 'new', null),
      'notes', jsonb_build_object('old', old.notes, 'new', null)
    );
  else
    v_recorded_by_after := new.recorded_by;
    v_class_attendance_id := new.id;
    v_class_id := new.class_id;
    v_profile_id := new.profile_id;
    if tg_op = 'UPDATE' then
      v_recorded_by_before := old.recorded_by;
      if new.state is distinct from old.state then
        v_changed_fields := v_changed_fields || jsonb_build_object('state', jsonb_build_object('old', old.state, 'new', new.state));
      end if;
      if new.inactive_at is distinct from old.inactive_at then
        v_changed_fields := v_changed_fields || jsonb_build_object('inactive_at', jsonb_build_object('old', old.inactive_at, 'new', new.inactive_at));
      end if;
      if new.inactive_by is distinct from old.inactive_by then
        v_changed_fields := v_changed_fields || jsonb_build_object('inactive_by', jsonb_build_object('old', old.inactive_by, 'new', new.inactive_by));
      end if;
      if new.inactive_reason is distinct from old.inactive_reason then
        v_changed_fields := v_changed_fields || jsonb_build_object('inactive_reason', jsonb_build_object('old', old.inactive_reason, 'new', new.inactive_reason));
      end if;
      if new.status is distinct from old.status then
        v_changed_fields := v_changed_fields || jsonb_build_object('status', jsonb_build_object('old', old.status, 'new', new.status));
      end if;
      if new.photo_status is distinct from old.photo_status then
        v_changed_fields := v_changed_fields || jsonb_build_object('photo_status', jsonb_build_object('old', old.photo_status, 'new', new.photo_status));
      end if;
      if new.camera_on is distinct from old.camera_on then
        v_changed_fields := v_changed_fields || jsonb_build_object('camera_on', jsonb_build_object('old', old.camera_on, 'new', new.camera_on));
      end if;
      if new.gift_card_blocked is distinct from old.gift_card_blocked then
        v_changed_fields := v_changed_fields || jsonb_build_object('gift_card_blocked', jsonb_build_object('old', old.gift_card_blocked, 'new', new.gift_card_blocked));
      end if;
      if new.gift_card_block_reason is distinct from old.gift_card_block_reason then
        v_changed_fields := v_changed_fields || jsonb_build_object('gift_card_block_reason', jsonb_build_object('old', old.gift_card_block_reason, 'new', new.gift_card_block_reason));
      end if;
      if new.gift_card_blocked_at is distinct from old.gift_card_blocked_at then
        v_changed_fields := v_changed_fields || jsonb_build_object('gift_card_blocked_at', jsonb_build_object('old', old.gift_card_blocked_at, 'new', new.gift_card_blocked_at));
      end if;
      if new.gift_card_blocked_by is distinct from old.gift_card_blocked_by then
        v_changed_fields := v_changed_fields || jsonb_build_object('gift_card_blocked_by', jsonb_build_object('old', old.gift_card_blocked_by, 'new', new.gift_card_blocked_by));
      end if;
      if new.recorded_by is distinct from old.recorded_by then
        v_changed_fields := v_changed_fields || jsonb_build_object('recorded_by', jsonb_build_object('old', old.recorded_by, 'new', new.recorded_by));
      end if;
      if new.notes is distinct from old.notes then
        v_changed_fields := v_changed_fields || jsonb_build_object('notes', jsonb_build_object('old', old.notes, 'new', new.notes));
      end if;
      if new.class_id is distinct from old.class_id then
        v_changed_fields := v_changed_fields || jsonb_build_object('class_id', jsonb_build_object('old', old.class_id, 'new', new.class_id));
      end if;
      if new.profile_id is distinct from old.profile_id then
        v_changed_fields := v_changed_fields || jsonb_build_object('profile_id', jsonb_build_object('old', old.profile_id, 'new', new.profile_id));
      end if;
      if v_changed_fields = '{}'::jsonb then
        return new;
      end if;
    else
      v_changed_fields := jsonb_build_object(
        'state', jsonb_build_object('old', null, 'new', new.state),
        'inactive_at', jsonb_build_object('old', null, 'new', new.inactive_at),
        'inactive_by', jsonb_build_object('old', null, 'new', new.inactive_by),
        'inactive_reason', jsonb_build_object('old', null, 'new', new.inactive_reason),
        'status', jsonb_build_object('old', null, 'new', new.status),
        'photo_status', jsonb_build_object('old', null, 'new', new.photo_status),
        'camera_on', jsonb_build_object('old', null, 'new', new.camera_on),
        'gift_card_blocked', jsonb_build_object('old', null, 'new', new.gift_card_blocked),
        'gift_card_block_reason', jsonb_build_object('old', null, 'new', new.gift_card_block_reason),
        'gift_card_blocked_at', jsonb_build_object('old', null, 'new', new.gift_card_blocked_at),
        'gift_card_blocked_by', jsonb_build_object('old', null, 'new', new.gift_card_blocked_by),
        'recorded_by', jsonb_build_object('old', null, 'new', new.recorded_by),
        'notes', jsonb_build_object('old', null, 'new', new.notes)
      );
    end if;
  end if;

  if coalesce(v_claims ->> 'role', '') = 'service_role' then
    v_source := 'automation';
  elsif v_actor_user_id is not null or coalesce(v_recorded_by_after, v_recorded_by_before) is not null then
    v_source := 'manual';
  else
    v_source := 'unknown';
  end if;

  insert into public.class_attendance_audit (
    class_attendance_id,
    class_id,
    profile_id,
    event_type,
    source,
    actor_user_id,
    actor_role,
    recorded_by_before,
    recorded_by_after,
    changed_fields
  )
  values (
    v_class_attendance_id,
    v_class_id,
    v_profile_id,
    lower(tg_op),
    v_source,
    v_actor_user_id,
    v_actor_role,
    v_recorded_by_before,
    v_recorded_by_after,
    v_changed_fields
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

grant usage on type public.class_attendance_state to authenticated, supabase_auth_admin;
