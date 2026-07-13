create table if not exists public.class_attendance_audit (
  id uuid primary key default gen_random_uuid(),
  class_attendance_id uuid,
  class_id uuid,
  profile_id uuid,
  event_type text not null,
  source text not null,
  actor_user_id uuid references auth.users (id) on update cascade on delete set null,
  actor_role text,
  recorded_by_before uuid references auth.users (id) on update cascade on delete set null,
  recorded_by_after uuid references auth.users (id) on update cascade on delete set null,
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (event_type in ('insert', 'update', 'delete')),
  check (source in ('manual', 'automation', 'unknown'))
);

create index if not exists class_attendance_audit_class_profile_created_idx
  on public.class_attendance_audit (class_id, profile_id, created_at desc);

create index if not exists class_attendance_audit_attendance_created_idx
  on public.class_attendance_audit (class_attendance_id, created_at desc);

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

drop trigger if exists on_class_attendance_audited on public.class_attendance;
create trigger on_class_attendance_audited
after insert or update or delete on public.class_attendance
for each row execute function public.audit_class_attendance_changes();

alter table public.class_attendance_audit enable row level security;

drop policy if exists class_attendance_audit_select_admin on public.class_attendance_audit;
create policy class_attendance_audit_select_admin
  on public.class_attendance_audit
  for select
  using (public.authorize('class_attendance.read'));

drop policy if exists class_attendance_audit_read_auth_admin on public.class_attendance_audit;
create policy class_attendance_audit_read_auth_admin
  on public.class_attendance_audit
  for select
  to supabase_auth_admin
  using (true);
