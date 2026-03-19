-- Ensure manager role has permissions for workshop sections and enrollments.
insert into public.role_permission (role, permission)
select r.role, p.permission
from (values ('manager'::public.app_role)) as r(role)
cross join (
    values
      ('workshop.create'::public.app_permissions),
      ('workshop.read'::public.app_permissions),
      ('workshop.update'::public.app_permissions),
      ('workshop.delete'::public.app_permissions),
      ('semester.read'::public.app_permissions),
      ('semester.update'::public.app_permissions),
      ('workshop_enrollment.create'::public.app_permissions),
      ('workshop_enrollment.read'::public.app_permissions),
      ('workshop_enrollment.update'::public.app_permissions),
      ('workshop_enrollment.update_status'::public.app_permissions),
      ('class_attendance.read'::public.app_permissions),
      ('class_attendance.update'::public.app_permissions)
) as p(permission)
on conflict do nothing;
