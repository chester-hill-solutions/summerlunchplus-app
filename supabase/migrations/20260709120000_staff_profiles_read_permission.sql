insert into public.role_permission (role, permission)
values ('staff'::app_role, 'profiles.read'::app_permissions)
on conflict do nothing;
