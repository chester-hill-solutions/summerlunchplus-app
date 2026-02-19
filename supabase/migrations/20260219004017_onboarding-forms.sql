create type "public"."app_permissions" as enum ('site.read');

create type "public"."form_assignment_status" as enum ('pending', 'submitted');

create type "public"."form_question_type" as enum ('text', 'single_choice', 'multi_choice', 'date', 'address');

drop policy "user_roles_write_admin" on "public"."user_roles";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "anon";

revoke select on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke delete on table "public"."profiles" from "authenticated";

revoke insert on table "public"."profiles" from "authenticated";

revoke references on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";


  create table "public"."form" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "due_at" timestamp with time zone,
    "is_required" boolean not null default true,
    "auto_assign" public.app_role[] not null default '{}'::public.app_role[],
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."form" enable row level security;


  create table "public"."form_answer" (
    "id" uuid not null default gen_random_uuid(),
    "submission_id" uuid not null,
    "question_id" uuid not null,
    "value" jsonb not null
      );


alter table "public"."form_answer" enable row level security;


  create table "public"."form_assignment" (
    "id" uuid not null default gen_random_uuid(),
    "form_id" uuid not null,
    "user_id" uuid not null,
    "assigned_by" uuid,
    "assigned_at" timestamp with time zone not null default now(),
    "due_at" timestamp with time zone,
    "status" public.form_assignment_status not null default 'pending'::public.form_assignment_status
      );


alter table "public"."form_assignment" enable row level security;


  create table "public"."form_question" (
    "id" uuid not null default gen_random_uuid(),
    "form_id" uuid not null,
    "prompt" text not null,
    "kind" public.form_question_type not null,
    "position" integer not null,
    "options" jsonb not null default '[]'::jsonb
      );


alter table "public"."form_question" enable row level security;


  create table "public"."form_submission" (
    "id" uuid not null default gen_random_uuid(),
    "form_id" uuid not null,
    "user_id" uuid not null,
    "submitted_at" timestamp with time zone not null default now()
      );


alter table "public"."form_submission" enable row level security;


  create table "public"."role_permission" (
    "role" public.app_role not null,
    "permission" public.app_permissions not null
      );


alter table "public"."role_permission" enable row level security;

CREATE UNIQUE INDEX form_answer_pkey ON public.form_answer USING btree (id);

CREATE UNIQUE INDEX form_answer_submission_id_question_id_key ON public.form_answer USING btree (submission_id, question_id);

CREATE UNIQUE INDEX form_assignment_form_id_user_id_key ON public.form_assignment USING btree (form_id, user_id);

CREATE UNIQUE INDEX form_assignment_pkey ON public.form_assignment USING btree (id);

CREATE UNIQUE INDEX form_name_key ON public.form USING btree (name);

CREATE UNIQUE INDEX form_pkey ON public.form USING btree (id);

CREATE UNIQUE INDEX form_question_form_id_position_key ON public.form_question USING btree (form_id, "position");

CREATE UNIQUE INDEX form_question_pkey ON public.form_question USING btree (id);

CREATE UNIQUE INDEX form_submission_form_id_user_id_key ON public.form_submission USING btree (form_id, user_id);

CREATE UNIQUE INDEX form_submission_pkey ON public.form_submission USING btree (id);

CREATE UNIQUE INDEX role_permission_pkey ON public.role_permission USING btree (role, permission);

alter table "public"."form" add constraint "form_pkey" PRIMARY KEY using index "form_pkey";

alter table "public"."form_answer" add constraint "form_answer_pkey" PRIMARY KEY using index "form_answer_pkey";

alter table "public"."form_assignment" add constraint "form_assignment_pkey" PRIMARY KEY using index "form_assignment_pkey";

alter table "public"."form_question" add constraint "form_question_pkey" PRIMARY KEY using index "form_question_pkey";

alter table "public"."form_submission" add constraint "form_submission_pkey" PRIMARY KEY using index "form_submission_pkey";

alter table "public"."role_permission" add constraint "role_permission_pkey" PRIMARY KEY using index "role_permission_pkey";

alter table "public"."form" add constraint "form_name_key" UNIQUE using index "form_name_key";

alter table "public"."form_answer" add constraint "form_answer_question_id_fkey" FOREIGN KEY (question_id) REFERENCES public.form_question(id) ON DELETE CASCADE not valid;

alter table "public"."form_answer" validate constraint "form_answer_question_id_fkey";

alter table "public"."form_answer" add constraint "form_answer_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES public.form_submission(id) ON DELETE CASCADE not valid;

alter table "public"."form_answer" validate constraint "form_answer_submission_id_fkey";

alter table "public"."form_answer" add constraint "form_answer_submission_id_question_id_key" UNIQUE using index "form_answer_submission_id_question_id_key";

alter table "public"."form_assignment" add constraint "form_assignment_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES auth.users(id) not valid;

alter table "public"."form_assignment" validate constraint "form_assignment_assigned_by_fkey";

alter table "public"."form_assignment" add constraint "form_assignment_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.form(id) ON DELETE CASCADE not valid;

alter table "public"."form_assignment" validate constraint "form_assignment_form_id_fkey";

alter table "public"."form_assignment" add constraint "form_assignment_form_id_user_id_key" UNIQUE using index "form_assignment_form_id_user_id_key";

alter table "public"."form_assignment" add constraint "form_assignment_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."form_assignment" validate constraint "form_assignment_user_id_fkey";

alter table "public"."form_question" add constraint "form_question_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.form(id) ON DELETE CASCADE not valid;

alter table "public"."form_question" validate constraint "form_question_form_id_fkey";

alter table "public"."form_question" add constraint "form_question_form_id_position_key" UNIQUE using index "form_question_form_id_position_key";

alter table "public"."form_submission" add constraint "form_submission_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.form(id) ON DELETE CASCADE not valid;

alter table "public"."form_submission" validate constraint "form_submission_form_id_fkey";

alter table "public"."form_submission" add constraint "form_submission_form_id_user_id_key" UNIQUE using index "form_submission_form_id_user_id_key";

alter table "public"."form_submission" add constraint "form_submission_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."form_submission" validate constraint "form_submission_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.has_completed_required_forms(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with required_assignments as (
    select fa.form_id
    from public.form_assignment fa
    join public.form f on f.id = fa.form_id
    where fa.user_id = p_user_id
      and f.is_required = true
  )
  select case
    when not exists (select 1 from required_assignments) then false
    when exists (
      select 1 from required_assignments ra
      left join public.form_submission fs on fs.form_id = ra.form_id and fs.user_id = p_user_id
      where fs.id is null
    ) then false
    else true
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_assignment_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.form_assignment
  set status = 'submitted'
  where form_id = new.form_id
    and user_id = new.user_id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.promote_user_after_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_role app_role;
begin
  if not public.should_auto_promote_onboarding() then
    return new;
  end if;

  select role into current_role from public.user_roles where user_id = new.user_id;
  if current_role is distinct from 'unassigned' then
    return new;
  end if;

  if public.has_completed_required_forms(new.user_id) then
    update public.user_roles
    set role = 'student'
    where user_id = new.user_id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.should_auto_promote_onboarding()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(nullif(current_setting('app.onboarding_mode', true), ''), 'role') <> 'permission';
$function$
;

CREATE OR REPLACE FUNCTION public.sync_auto_assigned_forms_for_form(p_form_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.form_assignment (form_id, user_id, assigned_by)
  select f.id, ur.user_id, null
  from public.form f
  join public.user_roles ur on ur.role = any (f.auto_assign)
  where f.id = p_form_id
  on conflict (form_id, user_id) do nothing;

  delete from public.form_assignment fa
  using public.form f
  join public.user_roles ur on ur.user_id = fa.user_id
  where fa.form_id = f.id
    and f.id = p_form_id
    and not (ur.role = any (f.auto_assign))
    and not exists (
      select 1 from public.form_submission fs
      where fs.form_id = fa.form_id
        and fs.user_id = fa.user_id
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_auto_assigned_forms_for_form_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.sync_auto_assigned_forms_for_form(new.id);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_auto_assigned_forms_for_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  user_role app_role;
begin
  select role into user_role from public.user_roles where user_id = p_user_id;
  user_role := coalesce(user_role, 'unassigned'::app_role);

  insert into public.form_assignment (form_id, user_id, assigned_by)
  select f.id, p_user_id, null
  from public.form f
  where user_role = any (f.auto_assign)
  on conflict (form_id, user_id) do nothing;

  delete from public.form_assignment fa
  using public.form f
  where fa.form_id = f.id
    and fa.user_id = p_user_id
    and not (user_role = any (f.auto_assign))
    and not exists (
      select 1 from public.form_submission fs
      where fs.form_id = fa.form_id
        and fs.user_id = fa.user_id
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_auto_assigned_forms_for_user_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.sync_auto_assigned_forms_for_user(new.user_id);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_form_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    claims jsonb;
    user_role app_role;
    permissions jsonb;
    onboarding_complete boolean;
  begin
    select role into user_role from public.user_roles where user_id = (event->>'user_id')::uuid;
    select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
      into permissions
      from public.role_permission rp
      where rp.role = coalesce(user_role, 'unassigned'::app_role);

    select coalesce(public.has_completed_required_forms((event->>'user_id')::uuid), false)
      into onboarding_complete;

    claims := coalesce(event->'claims', '{}'::jsonb);
    claims := jsonb_set(
      claims,
      '{user_role}',
      to_jsonb(coalesce(user_role, 'unassigned'::app_role))
    );
    claims := jsonb_set(
      claims,
      '{permissions}',
      permissions
    );
    claims := jsonb_set(
      claims,
      '{onboarding_complete}',
      to_jsonb(onboarding_complete)
    );
    event := jsonb_set(event, '{claims}', claims);
    return event;
  end;
$function$
;

grant delete on table "public"."form" to "authenticated";

grant insert on table "public"."form" to "authenticated";

grant references on table "public"."form" to "authenticated";

grant select on table "public"."form" to "authenticated";

grant trigger on table "public"."form" to "authenticated";

grant truncate on table "public"."form" to "authenticated";

grant update on table "public"."form" to "authenticated";

grant delete on table "public"."form" to "service_role";

grant insert on table "public"."form" to "service_role";

grant references on table "public"."form" to "service_role";

grant select on table "public"."form" to "service_role";

grant trigger on table "public"."form" to "service_role";

grant truncate on table "public"."form" to "service_role";

grant update on table "public"."form" to "service_role";

grant delete on table "public"."form" to "supabase_auth_admin";

grant insert on table "public"."form" to "supabase_auth_admin";

grant references on table "public"."form" to "supabase_auth_admin";

grant select on table "public"."form" to "supabase_auth_admin";

grant trigger on table "public"."form" to "supabase_auth_admin";

grant truncate on table "public"."form" to "supabase_auth_admin";

grant update on table "public"."form" to "supabase_auth_admin";

grant delete on table "public"."form_answer" to "authenticated";

grant insert on table "public"."form_answer" to "authenticated";

grant references on table "public"."form_answer" to "authenticated";

grant select on table "public"."form_answer" to "authenticated";

grant trigger on table "public"."form_answer" to "authenticated";

grant truncate on table "public"."form_answer" to "authenticated";

grant update on table "public"."form_answer" to "authenticated";

grant delete on table "public"."form_answer" to "service_role";

grant insert on table "public"."form_answer" to "service_role";

grant references on table "public"."form_answer" to "service_role";

grant select on table "public"."form_answer" to "service_role";

grant trigger on table "public"."form_answer" to "service_role";

grant truncate on table "public"."form_answer" to "service_role";

grant update on table "public"."form_answer" to "service_role";

grant delete on table "public"."form_answer" to "supabase_auth_admin";

grant insert on table "public"."form_answer" to "supabase_auth_admin";

grant references on table "public"."form_answer" to "supabase_auth_admin";

grant select on table "public"."form_answer" to "supabase_auth_admin";

grant trigger on table "public"."form_answer" to "supabase_auth_admin";

grant truncate on table "public"."form_answer" to "supabase_auth_admin";

grant update on table "public"."form_answer" to "supabase_auth_admin";

grant delete on table "public"."form_assignment" to "authenticated";

grant insert on table "public"."form_assignment" to "authenticated";

grant references on table "public"."form_assignment" to "authenticated";

grant select on table "public"."form_assignment" to "authenticated";

grant trigger on table "public"."form_assignment" to "authenticated";

grant truncate on table "public"."form_assignment" to "authenticated";

grant update on table "public"."form_assignment" to "authenticated";

grant delete on table "public"."form_assignment" to "service_role";

grant insert on table "public"."form_assignment" to "service_role";

grant references on table "public"."form_assignment" to "service_role";

grant select on table "public"."form_assignment" to "service_role";

grant trigger on table "public"."form_assignment" to "service_role";

grant truncate on table "public"."form_assignment" to "service_role";

grant update on table "public"."form_assignment" to "service_role";

grant delete on table "public"."form_assignment" to "supabase_auth_admin";

grant insert on table "public"."form_assignment" to "supabase_auth_admin";

grant references on table "public"."form_assignment" to "supabase_auth_admin";

grant select on table "public"."form_assignment" to "supabase_auth_admin";

grant trigger on table "public"."form_assignment" to "supabase_auth_admin";

grant truncate on table "public"."form_assignment" to "supabase_auth_admin";

grant update on table "public"."form_assignment" to "supabase_auth_admin";

grant delete on table "public"."form_question" to "authenticated";

grant insert on table "public"."form_question" to "authenticated";

grant references on table "public"."form_question" to "authenticated";

grant select on table "public"."form_question" to "authenticated";

grant trigger on table "public"."form_question" to "authenticated";

grant truncate on table "public"."form_question" to "authenticated";

grant update on table "public"."form_question" to "authenticated";

grant delete on table "public"."form_question" to "service_role";

grant insert on table "public"."form_question" to "service_role";

grant references on table "public"."form_question" to "service_role";

grant select on table "public"."form_question" to "service_role";

grant trigger on table "public"."form_question" to "service_role";

grant truncate on table "public"."form_question" to "service_role";

grant update on table "public"."form_question" to "service_role";

grant delete on table "public"."form_question" to "supabase_auth_admin";

grant insert on table "public"."form_question" to "supabase_auth_admin";

grant references on table "public"."form_question" to "supabase_auth_admin";

grant select on table "public"."form_question" to "supabase_auth_admin";

grant trigger on table "public"."form_question" to "supabase_auth_admin";

grant truncate on table "public"."form_question" to "supabase_auth_admin";

grant update on table "public"."form_question" to "supabase_auth_admin";

grant delete on table "public"."form_submission" to "authenticated";

grant insert on table "public"."form_submission" to "authenticated";

grant references on table "public"."form_submission" to "authenticated";

grant select on table "public"."form_submission" to "authenticated";

grant trigger on table "public"."form_submission" to "authenticated";

grant truncate on table "public"."form_submission" to "authenticated";

grant update on table "public"."form_submission" to "authenticated";

grant delete on table "public"."form_submission" to "service_role";

grant insert on table "public"."form_submission" to "service_role";

grant references on table "public"."form_submission" to "service_role";

grant select on table "public"."form_submission" to "service_role";

grant trigger on table "public"."form_submission" to "service_role";

grant truncate on table "public"."form_submission" to "service_role";

grant update on table "public"."form_submission" to "service_role";

grant delete on table "public"."form_submission" to "supabase_auth_admin";

grant insert on table "public"."form_submission" to "supabase_auth_admin";

grant references on table "public"."form_submission" to "supabase_auth_admin";

grant select on table "public"."form_submission" to "supabase_auth_admin";

grant trigger on table "public"."form_submission" to "supabase_auth_admin";

grant truncate on table "public"."form_submission" to "supabase_auth_admin";

grant update on table "public"."form_submission" to "supabase_auth_admin";

grant delete on table "public"."role_permission" to "authenticated";

grant insert on table "public"."role_permission" to "authenticated";

grant references on table "public"."role_permission" to "authenticated";

grant select on table "public"."role_permission" to "authenticated";

grant trigger on table "public"."role_permission" to "authenticated";

grant truncate on table "public"."role_permission" to "authenticated";

grant update on table "public"."role_permission" to "authenticated";

grant delete on table "public"."role_permission" to "service_role";

grant insert on table "public"."role_permission" to "service_role";

grant references on table "public"."role_permission" to "service_role";

grant select on table "public"."role_permission" to "service_role";

grant trigger on table "public"."role_permission" to "service_role";

grant truncate on table "public"."role_permission" to "service_role";

grant update on table "public"."role_permission" to "service_role";

grant delete on table "public"."role_permission" to "supabase_auth_admin";

grant insert on table "public"."role_permission" to "supabase_auth_admin";

grant references on table "public"."role_permission" to "supabase_auth_admin";

grant select on table "public"."role_permission" to "supabase_auth_admin";

grant trigger on table "public"."role_permission" to "supabase_auth_admin";

grant truncate on table "public"."role_permission" to "supabase_auth_admin";

grant update on table "public"."role_permission" to "supabase_auth_admin";


  create policy "form_admin_manage"
  on "public"."form"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])))
with check (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])));



  create policy "form_assignee_read"
  on "public"."form"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.form_assignment fa
  WHERE ((fa.form_id = fa.id) AND (fa.user_id = auth.uid())))));



  create policy "form_read_auth_admin"
  on "public"."form"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "form_answer_admin_manage"
  on "public"."form_answer"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])))
with check (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])));



  create policy "form_answer_assignee_insert"
  on "public"."form_answer"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.form_submission fs
  WHERE ((fs.id = form_answer.submission_id) AND (fs.user_id = auth.uid())))));



  create policy "form_answer_assignee_read"
  on "public"."form_answer"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.form_submission fs
  WHERE ((fs.id = form_answer.submission_id) AND (fs.user_id = auth.uid())))));



  create policy "form_answer_read_auth_admin"
  on "public"."form_answer"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "form_assignment_admin_manage"
  on "public"."form_assignment"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])))
with check (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])));



  create policy "form_assignment_assignee_read"
  on "public"."form_assignment"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "form_assignment_assignee_update_status"
  on "public"."form_assignment"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "form_assignment_read_auth_admin"
  on "public"."form_assignment"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "form_question_admin_manage"
  on "public"."form_question"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])))
with check (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])));



  create policy "form_question_assignee_read"
  on "public"."form_question"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.form_assignment fa
  WHERE ((fa.form_id = form_question.form_id) AND (fa.user_id = auth.uid())))));



  create policy "form_question_read_auth_admin"
  on "public"."form_question"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "form_submission_admin_manage"
  on "public"."form_submission"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])))
with check (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])));



  create policy "form_submission_assignee_insert"
  on "public"."form_submission"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.form_assignment fa
  WHERE ((fa.form_id = form_submission.form_id) AND (fa.user_id = auth.uid()))))));



  create policy "form_submission_assignee_read"
  on "public"."form_submission"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "form_submission_read_auth_admin"
  on "public"."form_submission"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "role_permission_admin_manage"
  on "public"."role_permission"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])))
with check (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])));



  create policy "role_permission_read_auth_admin"
  on "public"."role_permission"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "user_roles_write_admin"
  on "public"."user_roles"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])))
with check (((auth.jwt() ->> 'user_role'::text) = ANY (ARRAY['admin'::text, 'manager'::text])));


CREATE TRIGGER on_form_auto_assign_changed_sync_assignments AFTER UPDATE OF auto_assign ON public.form FOR EACH ROW EXECUTE FUNCTION public.sync_auto_assigned_forms_for_form_trigger();

CREATE TRIGGER on_form_created_sync_assignments AFTER INSERT ON public.form FOR EACH ROW EXECUTE FUNCTION public.sync_auto_assigned_forms_for_form_trigger();

CREATE TRIGGER on_form_updated_set_timestamp BEFORE UPDATE ON public.form FOR EACH ROW EXECUTE FUNCTION public.touch_form_updated_at();

CREATE TRIGGER on_form_submission_auto_promote AFTER INSERT ON public.form_submission FOR EACH ROW EXECUTE FUNCTION public.promote_user_after_submission();

CREATE TRIGGER on_form_submission_mark_assignment AFTER INSERT ON public.form_submission FOR EACH ROW EXECUTE FUNCTION public.mark_assignment_submitted();

CREATE TRIGGER on_user_role_changed_sync_forms AFTER INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.sync_auto_assigned_forms_for_user_trigger();


