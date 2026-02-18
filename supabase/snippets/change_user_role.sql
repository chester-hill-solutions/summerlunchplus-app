-- Update or set a user's app role. Run with service_role or as an admin/manager.
-- Replace placeholders before executing.

-- Look up auth user id by email (optional helper):
-- select id, email from auth.users where email = 'user@example.com';

-- Set role (upsert):
insert into public.user_roles (user_id, role, assigned_by)
values ('bb2e6524-c5e9-4875-8d21-d834c00ecfb6', 'admin', 'bb2e6524-c5e9-4875-8d21-d834c00ecfb6')
on conflict (user_id) do update
  set role = excluded.role,
      assigned_by = excluded.assigned_by,
      created_at = now();

-- After changing roles, have the user sign out/in to refresh their JWT claims.
