-- Ensure admins/managers have form permissions (in case earlier seeding missed new enum values).
insert into public.role_permission (role, permission)
select r.role, p.permission
from (values ('admin'::public.app_role), ('manager'::public.app_role)) as r(role)
cross join (
  values
    ('form.create'::public.app_permissions),
    ('form.read'::public.app_permissions),
    ('form.update'::public.app_permissions),
    ('form.delete'::public.app_permissions)
) as p(permission)
on conflict do nothing;
