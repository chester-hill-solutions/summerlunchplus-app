-- Ensure manager role has permissions for class sections and enrollments.
insert into public.role_permission (role, permission)
select r.role, p.permission
from (values ('manager'::public.app_role)) as r(role)
cross join (
    values
      ('class.create'::public.app_permissions),
      ('class.read'::public.app_permissions),
      ('class.update'::public.app_permissions),
      ('class.delete'::public.app_permissions),
      ('class_enrollment.create'::public.app_permissions),
      ('class_enrollment.read'::public.app_permissions),
      ('class_enrollment.update'::public.app_permissions),
      ('class_enrollment.update_status'::public.app_permissions)
) as p(permission)
on conflict do nothing;
