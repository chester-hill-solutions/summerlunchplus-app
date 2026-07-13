do $$
declare
  remap record;
  target_form_id uuid;
  old_submission_count bigint;
begin
  for remap in
    select *
    from (
      values
        ('4c8e9a43-7b20-40ad-a34d-d8957a22b5a0'::uuid, 'Profile Information'::text, null::text),
        ('19787905-2375-4adf-a385-5ae9f6cc21b1'::uuid, 'Guardian Details'::text, null::text),
        ('f73986e2-0770-46ef-91f2-197f65fe95b5'::uuid, 'Household Address'::text, null::text),
        ('762dfe75-feb2-4619-99ce-245e8024ae02'::uuid, 'Additional Guardians'::text, null::text),
        ('6b9544a8-e5ab-4b04-8168-9f83bb14d09c'::uuid, 'Household Counts'::text, null::text),
        ('d9aa35c7-1090-48c8-b3b7-5c3b0444be31'::uuid, 'Child Information'::text, null::text),
        ('86e79eb0-21eb-476b-844f-e31ece0522c9'::uuid, 'Guardian Consent'::text, null::text),
        ('b0dad9dd-1423-4b73-bb94-43636c91df5c'::uuid, 'Child Email'::text, null::text),
        ('e5b1f761-b1b9-482d-87b4-5946dee10f8c'::uuid, 'Partner Organization'::text, null::text),
        ('f65fc3fd-352b-4bc0-860c-929b9daa17ac'::uuid, null::text, 'Pre-Semester Survey - %'::text)
    ) as t(old_id, target_name, target_like)
  loop
    select count(*)
    into old_submission_count
    from public.form_submission
    where form_id = remap.old_id;

    if old_submission_count = 0 then
      continue;
    end if;

    select f.id
    into target_form_id
    from public.form f
    where
      (remap.target_name is not null and f.name = remap.target_name)
      or (remap.target_like is not null and f.name like remap.target_like)
    order by
      case when remap.target_name is not null and f.name = remap.target_name then 0 else 1 end,
      f.created_at asc
    limit 1;

    if target_form_id is null then
      raise exception 'Missing remap target for legacy form ID % (% / %), rows=%',
        remap.old_id,
        coalesce(remap.target_name, '<null>'),
        coalesce(remap.target_like, '<null>'),
        old_submission_count;
    end if;

    update public.form_submission
    set form_id = target_form_id
    where form_id = remap.old_id;
  end loop;
end
$$;
