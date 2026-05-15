create or replace function public.profile_in_same_family(target_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  with recursive connected(profile_id) as (
    select public.current_profile_id()
    union
    select
      case
        when pgc.guardian_profile_id = connected.profile_id then pgc.child_profile_id
        else pgc.guardian_profile_id
      end
    from public.person_guardian_child pgc
    join connected
      on pgc.guardian_profile_id = connected.profile_id
      or pgc.child_profile_id = connected.profile_id
  )
  select exists (
    select 1
    from connected
    where connected.profile_id = target_profile_id
  );
$$;

drop policy if exists profile_read_guardian_child on public.profile;
drop policy if exists profile_read_family on public.profile;

create policy profile_read_family
  on public.profile
  for select
  using (public.profile_in_same_family(id));
