insert into public.zoom_host (
  zoom_user_email,
  display_name,
  is_active,
  priority,
  notes
)
values
  (
    'summerlunchprograms@gmail.com',
    'Joeie Schwartz',
    true,
    10,
    'Owner - Zoom Workplace Pro'
  ),
  (
    'hello@summerlunchplus.com',
    'Hello summerlunch+',
    true,
    20,
    'Member - Zoom Workplace Pro'
  ),
  (
    'summerlunchcamp@gmail.com',
    'summerlunch+ chef',
    true,
    30,
    'Member - Zoom Workplace Pro'
  ),
  (
    'summerlunchpluszoom@gmail.com',
    'summerlunch plus',
    true,
    40,
    'Member - Zoom Workplace Pro'
  )
on conflict (zoom_user_email)
do update
set
  display_name = excluded.display_name,
  is_active = excluded.is_active,
  priority = excluded.priority,
  notes = excluded.notes,
  updated_at = now();
