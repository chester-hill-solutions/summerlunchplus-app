revoke delete on table "public"."class_section" from "anon";

revoke insert on table "public"."class_section" from "anon";

revoke references on table "public"."class_section" from "anon";

revoke select on table "public"."class_section" from "anon";

revoke trigger on table "public"."class_section" from "anon";

revoke truncate on table "public"."class_section" from "anon";

revoke update on table "public"."class_section" from "anon";

revoke delete on table "public"."class_section_enrollment" from "anon";

revoke insert on table "public"."class_section_enrollment" from "anon";

revoke references on table "public"."class_section_enrollment" from "anon";

revoke select on table "public"."class_section_enrollment" from "anon";

revoke trigger on table "public"."class_section_enrollment" from "anon";

revoke truncate on table "public"."class_section_enrollment" from "anon";

revoke update on table "public"."class_section_enrollment" from "anon";




  create table "public"."person" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "role" text not null,
    "firstname" text not null,
    "surname" text not null,
    "phone" text not null,
    "postcode" text not null
      );



  create table "public"."person_parent" (
    "id" uuid not null default gen_random_uuid(),
    "person_id" uuid not null,
    "parent_id" uuid not null
      );


alter table "public"."role_permission" alter column permission type "public"."app_permissions" using permission::text::"public"."app_permissions";


CREATE UNIQUE INDEX person_parent_person_id_parent_id_key ON public.person_parent USING btree (person_id, parent_id);

CREATE UNIQUE INDEX person_parent_pkey ON public.person_parent USING btree (id);

CREATE UNIQUE INDEX person_pkey ON public.person USING btree (id);

alter table "public"."person" add constraint "person_pkey" PRIMARY KEY using index "person_pkey";

alter table "public"."person_parent" add constraint "person_parent_pkey" PRIMARY KEY using index "person_parent_pkey";

alter table "public"."person" add constraint "person_role_check" CHECK ((role = ANY (ARRAY['parent'::text, 'student'::text]))) not valid;

alter table "public"."person" validate constraint "person_role_check";

alter table "public"."person" add constraint "person_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."person" validate constraint "person_user_id_fkey";

alter table "public"."person_parent" add constraint "person_parent_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.person(id) not valid;

alter table "public"."person_parent" validate constraint "person_parent_parent_id_fkey";

alter table "public"."person_parent" add constraint "person_parent_person_id_fkey" FOREIGN KEY (person_id) REFERENCES public.person(id) not valid;

alter table "public"."person_parent" validate constraint "person_parent_person_id_fkey";

alter table "public"."person_parent" add constraint "person_parent_person_id_parent_id_key" UNIQUE using index "person_parent_person_id_parent_id_key";

grant delete on table "public"."person" to "anon";

grant insert on table "public"."person" to "anon";

grant references on table "public"."person" to "anon";

grant select on table "public"."person" to "anon";

grant trigger on table "public"."person" to "anon";

grant truncate on table "public"."person" to "anon";

grant update on table "public"."person" to "anon";

grant delete on table "public"."person" to "authenticated";

grant insert on table "public"."person" to "authenticated";

grant references on table "public"."person" to "authenticated";

grant select on table "public"."person" to "authenticated";

grant trigger on table "public"."person" to "authenticated";

grant truncate on table "public"."person" to "authenticated";

grant update on table "public"."person" to "authenticated";

grant delete on table "public"."person" to "service_role";

grant insert on table "public"."person" to "service_role";

grant references on table "public"."person" to "service_role";

grant select on table "public"."person" to "service_role";

grant trigger on table "public"."person" to "service_role";

grant truncate on table "public"."person" to "service_role";

grant update on table "public"."person" to "service_role";

grant delete on table "public"."person_parent" to "anon";

grant insert on table "public"."person_parent" to "anon";

grant references on table "public"."person_parent" to "anon";

grant select on table "public"."person_parent" to "anon";

grant trigger on table "public"."person_parent" to "anon";

grant truncate on table "public"."person_parent" to "anon";

grant update on table "public"."person_parent" to "anon";

grant delete on table "public"."person_parent" to "authenticated";

grant insert on table "public"."person_parent" to "authenticated";

grant references on table "public"."person_parent" to "authenticated";

grant select on table "public"."person_parent" to "authenticated";

grant trigger on table "public"."person_parent" to "authenticated";

grant truncate on table "public"."person_parent" to "authenticated";

grant update on table "public"."person_parent" to "authenticated";

grant delete on table "public"."person_parent" to "service_role";

grant insert on table "public"."person_parent" to "service_role";

grant references on table "public"."person_parent" to "service_role";

grant select on table "public"."person_parent" to "service_role";

grant trigger on table "public"."person_parent" to "service_role";

grant truncate on table "public"."person_parent" to "service_role";

grant update on table "public"."person_parent" to "service_role";
