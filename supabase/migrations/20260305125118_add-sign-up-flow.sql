
  create table "public"."sign_up_flow" (
    "id" uuid not null default gen_random_uuid(),
    "form_id" uuid not null,
    "slug" text not null,
    "step_order" integer not null,
    "roles" public.app_role[] not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."sign_up_flow" enable row level security;

CREATE UNIQUE INDEX sign_up_flow_form_id_key ON public.sign_up_flow USING btree (form_id);

CREATE UNIQUE INDEX sign_up_flow_pkey ON public.sign_up_flow USING btree (id);

CREATE UNIQUE INDEX sign_up_flow_step_order_key ON public.sign_up_flow USING btree (step_order);

alter table "public"."sign_up_flow" add constraint "sign_up_flow_pkey" PRIMARY KEY using index "sign_up_flow_pkey";

alter table "public"."sign_up_flow" add constraint "sign_up_flow_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.form(id) ON DELETE CASCADE not valid;

alter table "public"."sign_up_flow" validate constraint "sign_up_flow_form_id_fkey";

alter table "public"."sign_up_flow" add constraint "sign_up_flow_form_id_key" UNIQUE using index "sign_up_flow_form_id_key";

alter table "public"."sign_up_flow" add constraint "sign_up_flow_step_order_key" UNIQUE using index "sign_up_flow_step_order_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.touch_sign_up_flow_updated_at()
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

grant all on table "public"."sign_up_flow" to "supabase_auth_admin";

revoke all on table "public"."sign_up_flow" from authenticated, anon, public;

grant select on table "public"."sign_up_flow" to "authenticated";


  create policy "sign_up_flow_select_auth_admin"
  on "public"."sign_up_flow"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "sign_up_flow_select_site_read"
  on "public"."sign_up_flow"
  as permissive
  for select
  to public
using (public.authorize('site.read'::public.app_permissions));


CREATE TRIGGER on_sign_up_flow_updated_set_timestamp BEFORE UPDATE ON public.sign_up_flow FOR EACH ROW EXECUTE FUNCTION public.touch_sign_up_flow_updated_at();

