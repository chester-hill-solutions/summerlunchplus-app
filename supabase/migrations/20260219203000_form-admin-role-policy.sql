-- Allow form reads via the standard permission helper (idempotent guard).
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'form' and policyname = 'form_select_admin_role'
  ) then
    create policy form_select_admin_role
      on public.form
      for select
      using (public.authorize('form.read'));
  end if;
end $$;
