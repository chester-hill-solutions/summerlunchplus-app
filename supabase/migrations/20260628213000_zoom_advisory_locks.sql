create or replace function public.zoom_try_advisory_lock(p_lock_name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_try_advisory_lock(hashtextextended(coalesce(nullif(btrim(p_lock_name), ''), 'zoom:default'), 0));
$$;

create or replace function public.zoom_advisory_unlock(p_lock_name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_advisory_unlock(hashtextextended(coalesce(nullif(btrim(p_lock_name), ''), 'zoom:default'), 0));
$$;

grant execute on function public.zoom_try_advisory_lock(text) to supabase_auth_admin, service_role;
grant execute on function public.zoom_advisory_unlock(text) to supabase_auth_admin, service_role;
