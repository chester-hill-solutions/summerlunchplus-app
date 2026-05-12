alter table public.semester
add column if not exists name text,
add column if not exists description text;
