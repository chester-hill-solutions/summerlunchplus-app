alter table "public"."form_question_map" add column "metadata" jsonb not null default '{}'::jsonb;

alter table "public"."form_question_map" add column "visibility_condition" jsonb;

alter table "public"."profile" add column "city" text;

alter table "public"."profile" add column "household_children_count" integer;

alter table "public"."profile" add column "household_size" integer;

alter table "public"."profile" add column "province" text;

alter table "public"."profile" add column "street_address" text;

alter table "public"."sign_up_flow" add column "condition" jsonb;


