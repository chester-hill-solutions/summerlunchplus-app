revoke delete on table "public"."gift_card_asset" from "anon";

revoke insert on table "public"."gift_card_asset" from "anon";

revoke references on table "public"."gift_card_asset" from "anon";

revoke select on table "public"."gift_card_asset" from "anon";

revoke trigger on table "public"."gift_card_asset" from "anon";

revoke truncate on table "public"."gift_card_asset" from "anon";

revoke update on table "public"."gift_card_asset" from "anon";

revoke references on table "public"."gift_card_asset" from "authenticated";

revoke trigger on table "public"."gift_card_asset" from "authenticated";

revoke truncate on table "public"."gift_card_asset" from "authenticated";

revoke delete on table "public"."gift_card_upload" from "anon";

revoke insert on table "public"."gift_card_upload" from "anon";

revoke references on table "public"."gift_card_upload" from "anon";

revoke select on table "public"."gift_card_upload" from "anon";

revoke trigger on table "public"."gift_card_upload" from "anon";

revoke truncate on table "public"."gift_card_upload" from "anon";

revoke update on table "public"."gift_card_upload" from "anon";

revoke references on table "public"."gift_card_upload" from "authenticated";

revoke trigger on table "public"."gift_card_upload" from "authenticated";

revoke truncate on table "public"."gift_card_upload" from "authenticated";

alter table "public"."gift_card_asset" drop constraint "gift_card_asset_check";

alter table "public"."gift_card_asset" drop column "link_url";

alter table "public"."gift_card_asset" drop column "storage_path";

alter table "public"."gift_card_asset" add column "asset_url" text not null;

alter table "public"."gift_card_asset" add constraint "gift_card_asset_asset_url_check" CHECK ((asset_url <> ''::text)) not valid;

alter table "public"."gift_card_asset" validate constraint "gift_card_asset_asset_url_check";


