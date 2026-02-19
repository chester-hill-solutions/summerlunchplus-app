
  create table "public"."profiles" (
    "id" uuid not null,
    "email" text,
    "full_name" text,
    "avatar_url" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."profiles" enable row level security;

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.user_roles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_profile_updated_at()
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

grant select on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."profiles" to "supabase_auth_admin";

grant insert on table "public"."profiles" to "supabase_auth_admin";

grant references on table "public"."profiles" to "supabase_auth_admin";

grant select on table "public"."profiles" to "supabase_auth_admin";

grant trigger on table "public"."profiles" to "supabase_auth_admin";

grant truncate on table "public"."profiles" to "supabase_auth_admin";

grant update on table "public"."profiles" to "supabase_auth_admin";


  create policy "profiles_read_auth_admin"
  on "public"."profiles"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "profiles_read_self"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((id = auth.uid()));



  create policy "profiles_update_self"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((id = auth.uid()))
with check ((id = auth.uid()));


CREATE TRIGGER on_profile_updated_set_timestamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_profile_updated_at();

CREATE TRIGGER on_auth_user_created_create_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

CREATE TRIGGER on_auth_user_created_set_role AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();


