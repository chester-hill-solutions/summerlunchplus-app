create table if not exists public.zoom_job_lock (
  lock_name text primary key,
  owner_run_id text not null,
  owner_kind text not null,
  owner_instance text,
  metadata jsonb not null default '{}'::jsonb,
  acquired_at timestamptz not null default timezone('utc', now()),
  last_heartbeat_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create index if not exists zoom_job_lock_expires_idx on public.zoom_job_lock (expires_at);

create or replace function public.zoom_lock_try_acquire(
  p_lock_name text,
  p_owner_run_id text,
  p_owner_kind text,
  p_ttl_seconds integer default 120,
  p_metadata jsonb default '{}'::jsonb,
  p_owner_instance text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_lock_name text := coalesce(nullif(btrim(p_lock_name), ''), 'zoom:default');
  v_owner_run_id text := coalesce(nullif(btrim(p_owner_run_id), ''), 'unknown-run');
  v_owner_kind text := coalesce(nullif(btrim(p_owner_kind), ''), 'unknown-kind');
  v_expires_at timestamptz := v_now + make_interval(secs => greatest(coalesce(p_ttl_seconds, 120), 15));
  v_existing public.zoom_job_lock%rowtype;
begin
  delete from public.zoom_job_lock
  where lock_name = v_lock_name
    and expires_at <= v_now;

  insert into public.zoom_job_lock (
    lock_name,
    owner_run_id,
    owner_kind,
    owner_instance,
    metadata,
    acquired_at,
    last_heartbeat_at,
    expires_at
  )
  values (
    v_lock_name,
    v_owner_run_id,
    v_owner_kind,
    p_owner_instance,
    coalesce(p_metadata, '{}'::jsonb),
    v_now,
    v_now,
    v_expires_at
  )
  on conflict (lock_name) do nothing;

  if found then
    return jsonb_build_object(
      'acquired', true,
      'lock_name', v_lock_name,
      'owner_run_id', v_owner_run_id,
      'owner_kind', v_owner_kind,
      'expires_at', v_expires_at,
      'ttl_remaining_ms', greatest(0, floor(extract(epoch from (v_expires_at - v_now)) * 1000))::bigint
    );
  end if;

  select *
    into v_existing
  from public.zoom_job_lock
  where lock_name = v_lock_name;

  return jsonb_build_object(
    'acquired', false,
    'lock_name', v_lock_name,
    'blocked_by_owner_run_id', v_existing.owner_run_id,
    'blocked_by_owner_kind', v_existing.owner_kind,
    'blocked_by_owner_instance', v_existing.owner_instance,
    'blocked_expires_at', v_existing.expires_at,
    'ttl_remaining_ms', greatest(0, floor(extract(epoch from (v_existing.expires_at - v_now)) * 1000))::bigint,
    'metadata', coalesce(v_existing.metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.zoom_lock_heartbeat(
  p_lock_name text,
  p_owner_run_id text,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_lock_name text := coalesce(nullif(btrim(p_lock_name), ''), 'zoom:default');
  v_owner_run_id text := coalesce(nullif(btrim(p_owner_run_id), ''), 'unknown-run');
  v_expires_at timestamptz := v_now + make_interval(secs => greatest(coalesce(p_ttl_seconds, 120), 15));
begin
  update public.zoom_job_lock
  set
    last_heartbeat_at = v_now,
    expires_at = v_expires_at
  where lock_name = v_lock_name
    and owner_run_id = v_owner_run_id
    and expires_at > v_now;

  return found;
end;
$$;

create or replace function public.zoom_lock_release(
  p_lock_name text,
  p_owner_run_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_name text := coalesce(nullif(btrim(p_lock_name), ''), 'zoom:default');
  v_owner_run_id text := coalesce(nullif(btrim(p_owner_run_id), ''), 'unknown-run');
begin
  delete from public.zoom_job_lock
  where lock_name = v_lock_name
    and owner_run_id = v_owner_run_id;

  return found;
end;
$$;

grant all on table public.zoom_job_lock to supabase_auth_admin;
revoke all on table public.zoom_job_lock from authenticated, anon, public;
grant execute on function public.zoom_lock_try_acquire(text, text, text, integer, jsonb, text) to supabase_auth_admin, service_role;
grant execute on function public.zoom_lock_heartbeat(text, text, integer) to supabase_auth_admin, service_role;
grant execute on function public.zoom_lock_release(text, text) to supabase_auth_admin, service_role;
