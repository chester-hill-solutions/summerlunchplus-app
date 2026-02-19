-- Update or set a user's app role. Run with service_role or as an admin/manager.
-- Replace placeholders before executing.

-- Look up auth user id by email (optional helper):
-- select id, email from auth.users where email = 'user@example.com';

-- Set role (upsert):
insert into public.user_roles (user_id, role, assigned_by)
values ('49530db5-fb3c-4614-b027-a67d72d44952', 'admin', '49530db5-fb3c-4614-b027-a67d72d44952')
on conflict (user_id) do update
  set role = excluded.role,
      assigned_by = excluded.assigned_by,
      created_at = now();

-- After changing roles, have the user sign out/in to refresh their JWT claims.
