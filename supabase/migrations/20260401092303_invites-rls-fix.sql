revoke delete on table "public"."invites" from "anon";

revoke insert on table "public"."invites" from "anon";

revoke references on table "public"."invites" from "anon";

revoke select on table "public"."invites" from "anon";

revoke trigger on table "public"."invites" from "anon";

revoke truncate on table "public"."invites" from "anon";

revoke update on table "public"."invites" from "anon";

revoke delete on table "public"."invites" from "authenticated";

revoke insert on table "public"."invites" from "authenticated";

revoke references on table "public"."invites" from "authenticated";

revoke trigger on table "public"."invites" from "authenticated";

revoke truncate on table "public"."invites" from "authenticated";

alter table "public"."invites" enable row level security;

grant delete on table "public"."invites" to "supabase_auth_admin";

grant insert on table "public"."invites" to "supabase_auth_admin";

grant references on table "public"."invites" to "supabase_auth_admin";

grant select on table "public"."invites" to "supabase_auth_admin";

grant trigger on table "public"."invites" to "supabase_auth_admin";

grant truncate on table "public"."invites" to "supabase_auth_admin";

grant update on table "public"."invites" to "supabase_auth_admin";


  create policy "invites_insert_auth_admin"
  on "public"."invites"
  as permissive
  for insert
  to supabase_auth_admin
with check (true);



  create policy "invites_read_auth_admin"
  on "public"."invites"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "invites_read_self"
  on "public"."invites"
  as permissive
  for select
  to public
using (((inviter_user_id = auth.uid()) OR (invitee_user_id = auth.uid()) OR (invitee_email = auth.email())));



  create policy "invites_update_auth_admin"
  on "public"."invites"
  as permissive
  for update
  to supabase_auth_admin
using (true)
with check (true);



  create policy "invites_update_self"
  on "public"."invites"
  as permissive
  for update
  to public
using (((inviter_user_id = auth.uid()) OR (invitee_email = auth.email())))
with check (((inviter_user_id = auth.uid()) OR (invitee_email = auth.email())));



