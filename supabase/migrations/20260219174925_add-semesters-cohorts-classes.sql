create type "public"."cohort_enrollment_status" as enum ('pending', 'approved', 'rejected');

  create table "public"."class" (
    "id" uuid not null default gen_random_uuid(),
    "cohort_id" uuid,
    "starts_at" timestamp with time zone not null,
    "ends_at" timestamp with time zone not null,
    "location" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."class" enable row level security;


  create table "public"."cohort" (
    "id" uuid not null default gen_random_uuid(),
    "semester_id" uuid,
    "name" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."cohort" enable row level security;


  create table "public"."cohort_enrollment" (
    "id" uuid not null default gen_random_uuid(),
    "cohort_id" uuid,
    "user_id" uuid,
    "status" public.cohort_enrollment_status not null default 'pending'::public.cohort_enrollment_status,
    "requested_at" timestamp with time zone not null default now(),
    "decided_at" timestamp with time zone,
    "decided_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."cohort_enrollment" enable row level security;


  create table "public"."semester" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "starts_at" timestamp with time zone not null,
    "ends_at" timestamp with time zone not null,
    "starts_month" date not null,
    "ends_month" date not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."semester" enable row level security;

CREATE UNIQUE INDEX class_pkey ON public.class USING btree (id);

CREATE UNIQUE INDEX cohort_enrollment_cohort_id_user_id_key ON public.cohort_enrollment USING btree (cohort_id, user_id);

CREATE UNIQUE INDEX cohort_enrollment_pkey ON public.cohort_enrollment USING btree (id);

CREATE UNIQUE INDEX cohort_pkey ON public.cohort USING btree (id);

CREATE UNIQUE INDEX cohort_semester_id_name_key ON public.cohort USING btree (semester_id, name);

CREATE UNIQUE INDEX semester_name_key ON public.semester USING btree (name);

CREATE UNIQUE INDEX semester_pkey ON public.semester USING btree (id);

CREATE UNIQUE INDEX semester_starts_month_ends_month_key ON public.semester USING btree (starts_month, ends_month);

alter table "public"."class" add constraint "class_pkey" PRIMARY KEY using index "class_pkey";

alter table "public"."cohort" add constraint "cohort_pkey" PRIMARY KEY using index "cohort_pkey";

alter table "public"."cohort_enrollment" add constraint "cohort_enrollment_pkey" PRIMARY KEY using index "cohort_enrollment_pkey";

alter table "public"."semester" add constraint "semester_pkey" PRIMARY KEY using index "semester_pkey";

alter table "public"."class" add constraint "class_check" CHECK ((starts_at < ends_at)) not valid;

alter table "public"."class" validate constraint "class_check";

alter table "public"."class" add constraint "class_cohort_id_fkey" FOREIGN KEY (cohort_id) REFERENCES public.cohort(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."class" validate constraint "class_cohort_id_fkey";

alter table "public"."cohort" add constraint "cohort_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semester(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."cohort" validate constraint "cohort_semester_id_fkey";

alter table "public"."cohort" add constraint "cohort_semester_id_name_key" UNIQUE using index "cohort_semester_id_name_key";

alter table "public"."cohort_enrollment" add constraint "cohort_enrollment_cohort_id_fkey" FOREIGN KEY (cohort_id) REFERENCES public.cohort(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."cohort_enrollment" validate constraint "cohort_enrollment_cohort_id_fkey";

alter table "public"."cohort_enrollment" add constraint "cohort_enrollment_cohort_id_user_id_key" UNIQUE using index "cohort_enrollment_cohort_id_user_id_key";

alter table "public"."cohort_enrollment" add constraint "cohort_enrollment_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."cohort_enrollment" validate constraint "cohort_enrollment_decided_by_fkey";

alter table "public"."cohort_enrollment" add constraint "cohort_enrollment_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."cohort_enrollment" validate constraint "cohort_enrollment_user_id_fkey";

alter table "public"."semester" add constraint "semester_check" CHECK ((starts_at < ends_at)) not valid;

alter table "public"."semester" validate constraint "semester_check";

alter table "public"."semester" add constraint "semester_name_key" UNIQUE using index "semester_name_key";

alter table "public"."semester" add constraint "semester_starts_month_ends_month_key" UNIQUE using index "semester_starts_month_ends_month_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_cohort_enrollment_decision_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status and new.status is distinct from 'pending' then
    new.decided_at := coalesce(new.decided_at, now());
    new.decided_by := coalesce(new.decided_by, auth.uid());
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_semester_months()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.starts_month := make_date(date_part('year', new.starts_at)::int, date_part('month', new.starts_at)::int, 1);
  new.ends_month := make_date(date_part('year', new.ends_at)::int, date_part('month', new.ends_at)::int, 1);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_class_updated_at()
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

CREATE OR REPLACE FUNCTION public.touch_cohort_enrollment_updated_at()
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

CREATE OR REPLACE FUNCTION public.touch_cohort_updated_at()
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

CREATE OR REPLACE FUNCTION public.touch_semester_updated_at()
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

grant delete on table "public"."class" to "authenticated";

grant insert on table "public"."class" to "authenticated";

grant references on table "public"."class" to "authenticated";

grant select on table "public"."class" to "authenticated";

grant trigger on table "public"."class" to "authenticated";

grant truncate on table "public"."class" to "authenticated";

grant update on table "public"."class" to "authenticated";

grant delete on table "public"."class" to "service_role";

grant insert on table "public"."class" to "service_role";

grant references on table "public"."class" to "service_role";

grant select on table "public"."class" to "service_role";

grant trigger on table "public"."class" to "service_role";

grant truncate on table "public"."class" to "service_role";

grant update on table "public"."class" to "service_role";

grant delete on table "public"."class" to "supabase_auth_admin";

grant insert on table "public"."class" to "supabase_auth_admin";

grant references on table "public"."class" to "supabase_auth_admin";

grant select on table "public"."class" to "supabase_auth_admin";

grant trigger on table "public"."class" to "supabase_auth_admin";

grant truncate on table "public"."class" to "supabase_auth_admin";

grant update on table "public"."class" to "supabase_auth_admin";

grant delete on table "public"."cohort" to "authenticated";

grant insert on table "public"."cohort" to "authenticated";

grant references on table "public"."cohort" to "authenticated";

grant select on table "public"."cohort" to "authenticated";

grant trigger on table "public"."cohort" to "authenticated";

grant truncate on table "public"."cohort" to "authenticated";

grant update on table "public"."cohort" to "authenticated";

grant delete on table "public"."cohort" to "service_role";

grant insert on table "public"."cohort" to "service_role";

grant references on table "public"."cohort" to "service_role";

grant select on table "public"."cohort" to "service_role";

grant trigger on table "public"."cohort" to "service_role";

grant truncate on table "public"."cohort" to "service_role";

grant update on table "public"."cohort" to "service_role";

grant delete on table "public"."cohort" to "supabase_auth_admin";

grant insert on table "public"."cohort" to "supabase_auth_admin";

grant references on table "public"."cohort" to "supabase_auth_admin";

grant select on table "public"."cohort" to "supabase_auth_admin";

grant trigger on table "public"."cohort" to "supabase_auth_admin";

grant truncate on table "public"."cohort" to "supabase_auth_admin";

grant update on table "public"."cohort" to "supabase_auth_admin";

grant delete on table "public"."cohort_enrollment" to "authenticated";

grant insert on table "public"."cohort_enrollment" to "authenticated";

grant references on table "public"."cohort_enrollment" to "authenticated";

grant select on table "public"."cohort_enrollment" to "authenticated";

grant trigger on table "public"."cohort_enrollment" to "authenticated";

grant truncate on table "public"."cohort_enrollment" to "authenticated";

grant update on table "public"."cohort_enrollment" to "authenticated";

grant delete on table "public"."cohort_enrollment" to "service_role";

grant insert on table "public"."cohort_enrollment" to "service_role";

grant references on table "public"."cohort_enrollment" to "service_role";

grant select on table "public"."cohort_enrollment" to "service_role";

grant trigger on table "public"."cohort_enrollment" to "service_role";

grant truncate on table "public"."cohort_enrollment" to "service_role";

grant update on table "public"."cohort_enrollment" to "service_role";

grant delete on table "public"."cohort_enrollment" to "supabase_auth_admin";

grant insert on table "public"."cohort_enrollment" to "supabase_auth_admin";

grant references on table "public"."cohort_enrollment" to "supabase_auth_admin";

grant select on table "public"."cohort_enrollment" to "supabase_auth_admin";

grant trigger on table "public"."cohort_enrollment" to "supabase_auth_admin";

grant truncate on table "public"."cohort_enrollment" to "supabase_auth_admin";

grant update on table "public"."cohort_enrollment" to "supabase_auth_admin";

grant delete on table "public"."semester" to "authenticated";

grant insert on table "public"."semester" to "authenticated";

grant references on table "public"."semester" to "authenticated";

grant select on table "public"."semester" to "authenticated";

grant trigger on table "public"."semester" to "authenticated";

grant truncate on table "public"."semester" to "authenticated";

grant update on table "public"."semester" to "authenticated";

grant delete on table "public"."semester" to "service_role";

grant insert on table "public"."semester" to "service_role";

grant references on table "public"."semester" to "service_role";

grant select on table "public"."semester" to "service_role";

grant trigger on table "public"."semester" to "service_role";

grant truncate on table "public"."semester" to "service_role";

grant update on table "public"."semester" to "service_role";

grant delete on table "public"."semester" to "supabase_auth_admin";

grant insert on table "public"."semester" to "supabase_auth_admin";

grant references on table "public"."semester" to "supabase_auth_admin";

grant select on table "public"."semester" to "supabase_auth_admin";

grant trigger on table "public"."semester" to "supabase_auth_admin";

grant truncate on table "public"."semester" to "supabase_auth_admin";

grant update on table "public"."semester" to "supabase_auth_admin";


  create policy "class_delete_admin"
  on "public"."class"
  as permissive
  for delete
  to public
using (public.authorize('class.delete'::public.app_permissions));



  create policy "class_insert_admin"
  on "public"."class"
  as permissive
  for insert
  to public
with check (public.authorize('class.create'::public.app_permissions));



  create policy "class_read_auth_admin"
  on "public"."class"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "class_select_all"
  on "public"."class"
  as permissive
  for select
  to public
using (true);



  create policy "class_update_admin"
  on "public"."class"
  as permissive
  for update
  to public
using (public.authorize('class.update'::public.app_permissions))
with check (public.authorize('class.update'::public.app_permissions));



  create policy "cohort_delete_admin"
  on "public"."cohort"
  as permissive
  for delete
  to public
using (public.authorize('cohort.delete'::public.app_permissions));



  create policy "cohort_insert_admin"
  on "public"."cohort"
  as permissive
  for insert
  to public
with check (public.authorize('cohort.create'::public.app_permissions));



  create policy "cohort_read_auth_admin"
  on "public"."cohort"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "cohort_select_all"
  on "public"."cohort"
  as permissive
  for select
  to public
using (true);



  create policy "cohort_update_admin"
  on "public"."cohort"
  as permissive
  for update
  to public
using (public.authorize('cohort.update'::public.app_permissions))
with check (public.authorize('cohort.update'::public.app_permissions));



  create policy "cohort_enrollment_insert_self"
  on "public"."cohort_enrollment"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (COALESCE(status, 'pending'::public.cohort_enrollment_status) = 'pending'::public.cohort_enrollment_status)));



  create policy "cohort_enrollment_read_auth_admin"
  on "public"."cohort_enrollment"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "cohort_enrollment_select_admin"
  on "public"."cohort_enrollment"
  as permissive
  for select
  to public
using (public.authorize('cohort_enrollment.read'::public.app_permissions));



  create policy "cohort_enrollment_select_self"
  on "public"."cohort_enrollment"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "cohort_enrollment_update_admin"
  on "public"."cohort_enrollment"
  as permissive
  for update
  to public
using ((public.authorize('cohort_enrollment.update'::public.app_permissions) OR public.authorize('cohort_enrollment.update_status'::public.app_permissions)))
with check ((public.authorize('cohort_enrollment.update'::public.app_permissions) OR public.authorize('cohort_enrollment.update_status'::public.app_permissions)));



  create policy "semester_delete_admin"
  on "public"."semester"
  as permissive
  for delete
  to public
using (public.authorize('semester.delete'::public.app_permissions));



  create policy "semester_insert_admin"
  on "public"."semester"
  as permissive
  for insert
  to public
with check (public.authorize('semester.create'::public.app_permissions));



  create policy "semester_read_auth_admin"
  on "public"."semester"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "semester_select_all"
  on "public"."semester"
  as permissive
  for select
  to public
using (true);



  create policy "semester_update_admin"
  on "public"."semester"
  as permissive
  for update
  to public
using (public.authorize('semester.update'::public.app_permissions))
with check (public.authorize('semester.update'::public.app_permissions));


CREATE TRIGGER on_class_updated_set_timestamp BEFORE UPDATE ON public.class FOR EACH ROW EXECUTE FUNCTION public.touch_class_updated_at();

CREATE TRIGGER on_cohort_updated_set_timestamp BEFORE UPDATE ON public.cohort FOR EACH ROW EXECUTE FUNCTION public.touch_cohort_updated_at();

CREATE TRIGGER on_cohort_enrollment_set_decision_fields BEFORE UPDATE ON public.cohort_enrollment FOR EACH ROW EXECUTE FUNCTION public.set_cohort_enrollment_decision_fields();

CREATE TRIGGER on_cohort_enrollment_updated_set_timestamp BEFORE UPDATE ON public.cohort_enrollment FOR EACH ROW EXECUTE FUNCTION public.touch_cohort_enrollment_updated_at();

CREATE TRIGGER on_semester_set_months BEFORE INSERT OR UPDATE ON public.semester FOR EACH ROW EXECUTE FUNCTION public.set_semester_months();

CREATE TRIGGER on_semester_updated_set_timestamp BEFORE UPDATE ON public.semester FOR EACH ROW EXECUTE FUNCTION public.touch_semester_updated_at();
