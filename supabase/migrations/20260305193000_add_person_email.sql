alter table public.person add column if not exists email text;

update public.person
set email = u.email
from auth.users u
where public.person.user_id = u.id
  and u.email is not null
  and (public.person.email is null or public.person.email = '');

alter table public.person
  add constraint person_email_key unique (email);
