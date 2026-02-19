-- Seed Summer 2026 semester with three cohorts and weekly kickoff classes.

with semester_row as (
  insert into public.semester (name, starts_at, ends_at)
  values (
    'Summer 2026',
    '2026-06-01T00:00:00Z',
    '2026-08-30T23:59:59Z'
  )
  on conflict (name) do update
    set starts_at = excluded.starts_at,
        ends_at = excluded.ends_at
  returning id
),
cohorts as (
  insert into public.cohort (semester_id, name)
  select s.id, cohort_name
  from semester_row s
  join (values
    ('Cohort Monday Explorers'),
    ('Cohort Wednesday Builders'),
    ('Cohort Friday Innovators')
  ) as names(cohort_name) on true
  on conflict (semester_id, name) do update
    set name = excluded.name
  returning id, name
)
insert into public.class (cohort_id, starts_at, ends_at, location)
select c.id, sched.starts_at::timestamptz, sched.ends_at::timestamptz, sched.location
from cohorts c
join (values
  ('Cohort Monday Explorers', '2026-06-08T14:00:00Z', '2026-06-08T16:00:00Z', 'Community Center A'), -- Mondays
  ('Cohort Wednesday Builders', '2026-06-10T15:00:00Z', '2026-06-10T17:00:00Z', 'STEM Lab 2'), -- Wednesdays
  ('Cohort Friday Innovators', '2026-06-12T13:00:00Z', '2026-06-12T15:00:00Z', 'Library Room 3') -- Fridays
) as sched(cohort_name, starts_at, ends_at, location)
  on c.name = sched.cohort_name
where not exists (
  select 1 from public.class existing
  where existing.cohort_id = c.id
    and existing.starts_at = sched.starts_at::timestamptz
    and existing.ends_at = sched.ends_at::timestamptz
);
