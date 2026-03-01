-- Ensure admin/manager roles have permissions for class sections and enrollments.
insert into public.role_permission (role, permission)
select r.role, p.permission
from (values ('admin'::public.app_role), ('manager'::public.app_role)) as r(role)
cross join (
  values
    ('class_section.create'::public.app_permissions),
    ('class_section.read'::public.app_permissions),
    ('class_section.update'::public.app_permissions),
    ('class_section.delete'::public.app_permissions),
    ('class_section_enrollment.create'::public.app_permissions),
    ('class_section_enrollment.read'::public.app_permissions),
    ('class_section_enrollment.update'::public.app_permissions),
    ('class_section_enrollment.update_status'::public.app_permissions)
) as p(permission)
on conflict do nothing;
