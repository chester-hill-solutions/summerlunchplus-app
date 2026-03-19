-- Update or set a user's app role. Run with service_role or as an admin/manager.
-- Replace placeholders before executing.

-- Look up auth user id by email, then upsert the role using that id.
with target_user as (
  select id
  from auth.users
  where email = 'sai@chsolutions.ca'
)
insert into public.user_roles (user_id, role, assigned_by)
select
  tu.id,
  'admin',
  tu.id
from target_user tu
on conflict (user_id) do update
  set role = excluded.role,
      assigned_by = excluded.assigned_by,
      created_at = now();

-- After changing roles, have the user sign out/in to refresh their JWT claims.
