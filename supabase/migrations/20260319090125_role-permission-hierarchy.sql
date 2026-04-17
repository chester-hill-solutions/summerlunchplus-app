create or replace function public.authorize(requested_permission public.app_permissions)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bind_permissions int;
  user_role public.app_role;
  user_rank int;
begin
  select coalesce(
    nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'), '')::public.app_role,
    'unassigned'::public.app_role
  ) into user_role;

  if (user_role = 'admin') then
    return true;
  end if;

  user_rank := case user_role
    when 'unassigned' then 0
    when 'student' then 1
    when 'guardian' then 2
    when 'instructor' then 3
    when 'staff' then 4
    when 'manager' then 5
    when 'admin' then 6
    else 0
  end;

  select count(*)
    into bind_permissions
    from public.role_permission
    where role_permission.permission = requested_permission
      and (
        case role_permission.role
          when 'unassigned' then 0
          when 'student' then 1
          when 'guardian' then 2
          when 'instructor' then 3
          when 'staff' then 4
          when 'manager' then 5
          when 'admin' then 6
          else 0
        end
      ) <= user_rank;

  return bind_permissions > 0;
end;
$$;
