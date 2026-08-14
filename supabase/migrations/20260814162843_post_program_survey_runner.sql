  create table "public"."post_program_survey_runner_lease" (
    "job_key" text not null,
    "owner_run_id" text not null,
    "acquired_at" timestamp with time zone not null,
    "expires_at" timestamp with time zone not null
      );


alter table "public"."post_program_survey_runner_lease" enable row level security;


  create table "public"."post_program_survey_runner_state" (
    "job_key" text not null,
    "last_enrollment_id" uuid,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."post_program_survey_runner_state" enable row level security;

revoke all on table public.post_program_survey_runner_lease from public, anon, authenticated;
revoke all on table public.post_program_survey_runner_state from public, anon, authenticated;

CREATE UNIQUE INDEX post_program_survey_runner_lease_pkey ON public.post_program_survey_runner_lease USING btree (job_key);

CREATE UNIQUE INDEX post_program_survey_runner_state_pkey ON public.post_program_survey_runner_state USING btree (job_key);

alter table "public"."post_program_survey_runner_lease" add constraint "post_program_survey_runner_lease_pkey" PRIMARY KEY using index "post_program_survey_runner_lease_pkey";

alter table "public"."post_program_survey_runner_state" add constraint "post_program_survey_runner_state_pkey" PRIMARY KEY using index "post_program_survey_runner_state_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.release_post_program_survey_runner_lease(p_job_key text, p_owner_run_id text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with deleted as (
    delete from public.post_program_survey_runner_lease
    where job_key = p_job_key and owner_run_id = p_owner_run_id
    returning job_key
  )
  select exists (select 1 from deleted);
$function$
;

CREATE OR REPLACE FUNCTION public.try_acquire_post_program_survey_runner_lease(p_job_key text, p_owner_run_id text, p_now timestamp with time zone, p_lease_seconds integer DEFAULT 300)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.post_program_survey_runner_lease (job_key, owner_run_id, acquired_at, expires_at)
  values (p_job_key, p_owner_run_id, p_now, p_now + make_interval(secs => greatest(30, p_lease_seconds)))
  on conflict (job_key) do update
  set owner_run_id = excluded.owner_run_id,
      acquired_at = excluded.acquired_at,
      expires_at = excluded.expires_at
  where post_program_survey_runner_lease.expires_at <= p_now
     or post_program_survey_runner_lease.owner_run_id = p_owner_run_id;

  return exists (
    select 1
    from public.post_program_survey_runner_lease
    where job_key = p_job_key and owner_run_id = p_owner_run_id
  );
end;
$function$
;

revoke all on function public.try_acquire_post_program_survey_runner_lease(text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.release_post_program_survey_runner_lease(text, text) from public, anon, authenticated;
grant execute on function public.try_acquire_post_program_survey_runner_lease(text, text, timestamptz, integer) to service_role;
grant execute on function public.release_post_program_survey_runner_lease(text, text) to service_role;

grant delete on table "public"."post_program_survey_runner_lease" to "service_role";

grant insert on table "public"."post_program_survey_runner_lease" to "service_role";

grant references on table "public"."post_program_survey_runner_lease" to "service_role";

grant select on table "public"."post_program_survey_runner_lease" to "service_role";

grant trigger on table "public"."post_program_survey_runner_lease" to "service_role";

grant truncate on table "public"."post_program_survey_runner_lease" to "service_role";

grant update on table "public"."post_program_survey_runner_lease" to "service_role";

grant delete on table "public"."post_program_survey_runner_state" to "service_role";

grant insert on table "public"."post_program_survey_runner_state" to "service_role";

grant references on table "public"."post_program_survey_runner_state" to "service_role";

grant select on table "public"."post_program_survey_runner_state" to "service_role";

grant trigger on table "public"."post_program_survey_runner_state" to "service_role";

grant truncate on table "public"."post_program_survey_runner_state" to "service_role";

grant update on table "public"."post_program_survey_runner_state" to "service_role";
