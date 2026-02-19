select auth.uid();                  -- should be your UUID
   select * from form_assignment where user_id = auth.uid();
   select * from form
     where exists (
       select 1 from form_assignment fa
       where fa.form_id = form.id
         and fa.user_id = auth.uid()
     );