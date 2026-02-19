insert into public.role_permission (role, permission)
select r.role, p.permission
from (values ('admin'::public.app_role), ('manager'::public.app_role)) as r(role)
cross join (
  values
    ('semester.create'::public.app_permissions),
    ('semester.read'::public.app_permissions),
    ('semester.update'::public.app_permissions),
    ('semester.delete'::public.app_permissions),
    ('cohort.create'::public.app_permissions),
    ('cohort.read'::public.app_permissions),
    ('cohort.update'::public.app_permissions),
    ('cohort.delete'::public.app_permissions),
    ('class.create'::public.app_permissions),
    ('class.read'::public.app_permissions),
    ('class.update'::public.app_permissions),
    ('class.delete'::public.app_permissions),
    ('cohort_enrollment.create'::public.app_permissions),
    ('cohort_enrollment.read'::public.app_permissions),
    ('cohort_enrollment.update'::public.app_permissions),
    ('cohort_enrollment.update_status'::public.app_permissions)
) as p(permission)
on conflict do nothing;
