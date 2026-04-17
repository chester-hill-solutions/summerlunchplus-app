create type "public"."gift_card_asset_status" as enum ('available', 'invalid');

create type "public"."gift_card_upload_status" as enum ('uploaded', 'processing', 'processed', 'failed');

create type "public"."gift_card_upload_type" as enum ('pdf_per_page', 'pdf_per_4_pages', 'csv_link');


  create table "public"."gift_card_asset" (
    "id" uuid not null default gen_random_uuid(),
    "upload_id" uuid not null,
    "value" numeric(10,2) not null,
    "storage_path" text,
    "link_url" text,
    "page_count" integer,
    "source_index" integer,
    "status" public.gift_card_asset_status not null default 'available'::public.gift_card_asset_status,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."gift_card_asset" enable row level security;


  create table "public"."gift_card_upload" (
    "id" uuid not null default gen_random_uuid(),
    "uploaded_by" uuid not null,
    "provider" text,
    "upload_type" public.gift_card_upload_type not null,
    "status" public.gift_card_upload_status not null default 'uploaded'::public.gift_card_upload_status,
    "file_name" text,
    "file_size" bigint,
    "total_cards" integer not null default 0,
    "processed_cards" integer not null default 0,
    "error_message" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."gift_card_upload" enable row level security;

CREATE UNIQUE INDEX gift_card_asset_pkey ON public.gift_card_asset USING btree (id);

CREATE INDEX gift_card_asset_status_idx ON public.gift_card_asset USING btree (status);

CREATE INDEX gift_card_asset_upload_id_idx ON public.gift_card_asset USING btree (upload_id);

CREATE UNIQUE INDEX gift_card_upload_pkey ON public.gift_card_upload USING btree (id);

CREATE INDEX gift_card_upload_status_idx ON public.gift_card_upload USING btree (status);

alter table "public"."gift_card_asset" add constraint "gift_card_asset_pkey" PRIMARY KEY using index "gift_card_asset_pkey";

alter table "public"."gift_card_upload" add constraint "gift_card_upload_pkey" PRIMARY KEY using index "gift_card_upload_pkey";

alter table "public"."gift_card_asset" add constraint "gift_card_asset_check" CHECK ((((storage_path IS NOT NULL) AND (link_url IS NULL)) OR ((storage_path IS NULL) AND (link_url IS NOT NULL)))) not valid;

alter table "public"."gift_card_asset" validate constraint "gift_card_asset_check";

alter table "public"."gift_card_asset" add constraint "gift_card_asset_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES public.gift_card_upload(id) ON DELETE CASCADE not valid;

alter table "public"."gift_card_asset" validate constraint "gift_card_asset_upload_id_fkey";

alter table "public"."gift_card_upload" add constraint "gift_card_upload_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."gift_card_upload" validate constraint "gift_card_upload_uploaded_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.touch_gift_card_asset_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_gift_card_upload_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."gift_card_asset" to "authenticated";

grant insert on table "public"."gift_card_asset" to "authenticated";

grant select on table "public"."gift_card_asset" to "authenticated";

grant update on table "public"."gift_card_asset" to "authenticated";

grant delete on table "public"."gift_card_asset" to "service_role";

grant insert on table "public"."gift_card_asset" to "service_role";

grant references on table "public"."gift_card_asset" to "service_role";

grant select on table "public"."gift_card_asset" to "service_role";

grant trigger on table "public"."gift_card_asset" to "service_role";

grant truncate on table "public"."gift_card_asset" to "service_role";

grant update on table "public"."gift_card_asset" to "service_role";

grant delete on table "public"."gift_card_asset" to "supabase_auth_admin";

grant insert on table "public"."gift_card_asset" to "supabase_auth_admin";

grant references on table "public"."gift_card_asset" to "supabase_auth_admin";

grant select on table "public"."gift_card_asset" to "supabase_auth_admin";

grant trigger on table "public"."gift_card_asset" to "supabase_auth_admin";

grant truncate on table "public"."gift_card_asset" to "supabase_auth_admin";

grant update on table "public"."gift_card_asset" to "supabase_auth_admin";

grant delete on table "public"."gift_card_upload" to "authenticated";

grant insert on table "public"."gift_card_upload" to "authenticated";

grant select on table "public"."gift_card_upload" to "authenticated";

grant update on table "public"."gift_card_upload" to "authenticated";

grant delete on table "public"."gift_card_upload" to "service_role";

grant insert on table "public"."gift_card_upload" to "service_role";

grant references on table "public"."gift_card_upload" to "service_role";

grant select on table "public"."gift_card_upload" to "service_role";

grant trigger on table "public"."gift_card_upload" to "service_role";

grant truncate on table "public"."gift_card_upload" to "service_role";

grant update on table "public"."gift_card_upload" to "service_role";

grant delete on table "public"."gift_card_upload" to "supabase_auth_admin";

grant insert on table "public"."gift_card_upload" to "supabase_auth_admin";

grant references on table "public"."gift_card_upload" to "supabase_auth_admin";

grant select on table "public"."gift_card_upload" to "supabase_auth_admin";

grant trigger on table "public"."gift_card_upload" to "supabase_auth_admin";

grant truncate on table "public"."gift_card_upload" to "supabase_auth_admin";

grant update on table "public"."gift_card_upload" to "supabase_auth_admin";


  create policy "gift_card_asset_manage_staff"
  on "public"."gift_card_asset"
  as permissive
  for all
  to public
using ((public.current_user_role() = ANY (ARRAY['admin'::public.app_role, 'manager'::public.app_role, 'staff'::public.app_role])))
with check ((public.current_user_role() = ANY (ARRAY['admin'::public.app_role, 'manager'::public.app_role, 'staff'::public.app_role])));



  create policy "gift_card_asset_read_auth_admin"
  on "public"."gift_card_asset"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "gift_card_upload_manage_staff"
  on "public"."gift_card_upload"
  as permissive
  for all
  to public
using ((public.current_user_role() = ANY (ARRAY['admin'::public.app_role, 'manager'::public.app_role, 'staff'::public.app_role])))
with check ((public.current_user_role() = ANY (ARRAY['admin'::public.app_role, 'manager'::public.app_role, 'staff'::public.app_role])));



  create policy "gift_card_upload_read_auth_admin"
  on "public"."gift_card_upload"
  as permissive
  for select
  to supabase_auth_admin
using (true);


CREATE TRIGGER on_gift_card_asset_updated_set_timestamp BEFORE UPDATE ON public.gift_card_asset FOR EACH ROW EXECUTE FUNCTION public.touch_gift_card_asset_updated_at();

CREATE TRIGGER on_gift_card_upload_updated_set_timestamp BEFORE UPDATE ON public.gift_card_upload FOR EACH ROW EXECUTE FUNCTION public.touch_gift_card_upload_updated_at();


