-- Junction table linking students to parents
create table public.person_parent (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person(id),
  parent_id uuid not null references public.person(id),
  unique (person_id, parent_id)
);
