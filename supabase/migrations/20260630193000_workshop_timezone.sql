alter table public.workshop
  add column if not exists timezone text;

update public.workshop
set timezone = coalesce(nullif(btrim(timezone), ''), 'America/New_York')
where timezone is null
   or btrim(timezone) = '';

alter table public.workshop
  alter column timezone set default 'America/New_York';

alter table public.workshop
  alter column timezone set not null;
