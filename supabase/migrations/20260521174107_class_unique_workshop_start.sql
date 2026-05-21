delete from public.class c
using public.class duplicate
where c.workshop_id is not null
  and duplicate.workshop_id is not null
  and c.workshop_id = duplicate.workshop_id
  and c.starts_at = duplicate.starts_at
  and c.id > duplicate.id;

create unique index if not exists class_workshop_start_unique_idx
  on public.class (workshop_id, starts_at);
