alter table "public"."gift_card_asset" alter column "status" drop default;

alter type "public"."gift_card_asset_status" rename to "gift_card_asset_status__old_version_to_be_dropped";

create type "public"."gift_card_asset_status" as enum ('available', 'sent', 'used', 'invalid');

alter table "public"."gift_card_asset" alter column status type "public"."gift_card_asset_status" using status::text::"public"."gift_card_asset_status";

alter table "public"."gift_card_asset" alter column "status" set default 'available'::public.gift_card_asset_status;

drop type "public"."gift_card_asset_status__old_version_to_be_dropped";

alter table "public"."gift_card_asset" add column "assigned_profile_id" uuid;

alter table "public"."gift_card_asset" add column "sent_at" timestamp with time zone;

alter table "public"."gift_card_asset" add column "used_at" timestamp with time zone;

alter table "public"."gift_card_upload" alter column "uploaded_by" drop not null;

alter table "public"."gift_card_asset" add constraint "gift_card_asset_assigned_profile_id_fkey" FOREIGN KEY (assigned_profile_id) REFERENCES public.profile(id) ON DELETE SET NULL not valid;

alter table "public"."gift_card_asset" validate constraint "gift_card_asset_assigned_profile_id_fkey";


