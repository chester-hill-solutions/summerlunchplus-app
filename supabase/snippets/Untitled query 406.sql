set client_min_messages = notice;
   begin;
   insert into public.form_submission(form_id, user_id)
   values ('ef31956a-3037-4a2c-914f-f27285cb5b53', 'd52fb350-3185-4de2-bb8a-b896df65acac')
   on conflict (form_id, user_id) do update set submitted_at = now()
   returning *;
   commit;