drop policy "form_assignee_read" on "public"."form";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.assignee_can_read_form(p_form_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(
    select 1
    from public.form_assignment fa
    where fa.form_id = p_form_id
      and fa.user_id = auth.uid()
  );
$function$
;


  create policy "form_assignee_read"
  on "public"."form"
  as permissive
  for select
  to public
using (public.assignee_can_read_form(id));



