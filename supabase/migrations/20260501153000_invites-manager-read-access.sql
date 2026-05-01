drop policy if exists invites_read_self on public.invites;

create policy invites_read_self
  on public.invites
  for select
  using (
    inviter_user_id = auth.uid()
    or invitee_user_id = auth.uid()
    or invitee_email = auth.email()
    or public.current_user_role() in ('manager'::public.app_role, 'admin'::public.app_role)
  );
