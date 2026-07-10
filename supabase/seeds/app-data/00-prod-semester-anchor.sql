-- Anchor the runtime semester used by the production snapshot workshop seeds.
-- Keep this id and window aligned with supabase/seeds/prod-data/20260624-raw*.sql.

insert into public.semester (
  id,
  starts_at,
  ends_at,
  enrollment_open_at,
  enrollment_close_at,
  name,
  description
)
values (
  '95b4cdf4-01fa-4c33-9863-506d4f6e91c2',
  '2026-06-29 04:00:00+00',
  '2026-08-21 03:59:00+00',
  '2026-05-15 04:00:00+00',
  '2027-07-30 03:59:00+00',
  '26 Summer',
  null
)
on conflict (id) do update
set starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    enrollment_open_at = excluded.enrollment_open_at,
    enrollment_close_at = excluded.enrollment_close_at,
    name = excluded.name,
    description = excluded.description;

update public.workshop
set enrollment_open_at = '2026-05-15 04:00:00+00',
    enrollment_close_at = '2027-07-30 03:59:00+00'
where semester_id = '95b4cdf4-01fa-4c33-9863-506d4f6e91c2';
