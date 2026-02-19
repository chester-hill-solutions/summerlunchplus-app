
  create policy "form_assignment_self_insert"
  on "public"."form_assignment"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.form f
  WHERE ((f.id = form_assignment.form_id) AND (((auth.jwt() ->> 'user_role'::text))::public.app_role = ANY (f.auto_assign)))))));



