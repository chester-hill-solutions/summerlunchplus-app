-- Person profile table storing additional user details
create table public.person (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('parent','student')),
  firstname text,
  surname text,
  phone text,
  postcode text
);
