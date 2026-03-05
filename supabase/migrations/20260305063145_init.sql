create type "public"."app_permissions" as enum ('site.read', 'form.create', 'form.read', 'form.update', 'form.delete', 'form_question.create', 'form_question.read', 'form_question.update', 'form_question.delete', 'form_assignment.create', 'form_assignment.read', 'form_assignment.update', 'form_assignment.delete', 'form_submission.create', 'form_submission.read', 'form_submission.update', 'form_submission.delete', 'form_answer.create', 'form_answer.read', 'form_answer.update', 'form_answer.delete', 'semester.create', 'semester.read', 'semester.update', 'semester.delete', 'cohort.create', 'cohort.read', 'cohort.update', 'cohort.delete', 'class.create', 'class.read', 'class.update', 'class.delete', 'class_enrollment.create', 'class_enrollment.read', 'class_enrollment.update', 'class_enrollment.update_status', 'cohort_enrollment.create', 'cohort_enrollment.read', 'cohort_enrollment.update', 'cohort_enrollment.update_status', 'user_roles.manage', 'role_permission.manage', 'profiles.read', 'profiles.update');

create type "public"."app_role" as enum ('unassigned', 'admin', 'manager', 'staff', 'instructor', 'student', 'parent');

create type "public"."class_enrollment_status" as enum ('pending', 'approved', 'rejected');

create type "public"."form_assignment_status" as enum ('pending', 'submitted');

create type "public"."form_question_type" as enum ('text', 'single_choice', 'multi_choice', 'date', 'address');


  create table "public"."class" (
    "id" uuid not null default gen_random_uuid(),
    "description" text,
    "enrollment_open_at" timestamp with time zone,
    "enrollment_close_at" timestamp with time zone,
    "capacity" integer not null default 0,
    "wait_list_capacity" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."class" enable row level security;


  create table "public"."class_enrollment" (
    "id" uuid not null default gen_random_uuid(),
    "class_id" uuid,
    "user_id" uuid,
    "status" public.class_enrollment_status not null default 'pending'::public.class_enrollment_status,
    "requested_at" timestamp with time zone not null default now(),
    "decided_at" timestamp with time zone,
    "decided_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."class_enrollment" enable row level security;


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


  create table "public"."person" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "role" text not null,
    "firstname" text,
    "surname" text,
    "phone" text,
    "postcode" text
      );



  create table "public"."person_parent" (
    "id" uuid not null default gen_random_uuid(),
    "person_id" uuid not null,
    "parent_id" uuid not null
      );



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


  create table "public"."role_permission" (
    "role" public.app_role not null,
    "permission" public.app_permissions not null
      );


alter table "public"."role_permission" enable row level security;


  create table "public"."session" (
    "id" uuid not null default gen_random_uuid(),
    "class_id" uuid,
    "starts_at" timestamp with time zone not null,
    "ends_at" timestamp with time zone not null,
    "location" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."session" enable row level security;


  create table "public"."user_roles" (
    "user_id" uuid not null,
    "role" public.app_role not null default 'unassigned'::public.app_role,
    "assigned_by" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."user_roles" enable row level security;

CREATE UNIQUE INDEX class_enrollment_class_id_user_id_key ON public.class_enrollment USING btree (class_id, user_id);

CREATE UNIQUE INDEX class_enrollment_pkey ON public.class_enrollment USING btree (id);

CREATE UNIQUE INDEX class_pkey ON public.class USING btree (id);

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

CREATE UNIQUE INDEX person_parent_person_id_parent_id_key ON public.person_parent USING btree (person_id, parent_id);

CREATE UNIQUE INDEX person_parent_pkey ON public.person_parent USING btree (id);

CREATE UNIQUE INDEX person_pkey ON public.person USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX role_permission_pkey ON public.role_permission USING btree (role, permission);

CREATE UNIQUE INDEX session_pkey ON public.session USING btree (id);

CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (user_id);

alter table "public"."class" add constraint "class_pkey" PRIMARY KEY using index "class_pkey";

alter table "public"."class_enrollment" add constraint "class_enrollment_pkey" PRIMARY KEY using index "class_enrollment_pkey";

alter table "public"."form" add constraint "form_pkey" PRIMARY KEY using index "form_pkey";

alter table "public"."form_answer" add constraint "form_answer_pkey" PRIMARY KEY using index "form_answer_pkey";

alter table "public"."form_assignment" add constraint "form_assignment_pkey" PRIMARY KEY using index "form_assignment_pkey";

alter table "public"."form_question" add constraint "form_question_pkey" PRIMARY KEY using index "form_question_pkey";

alter table "public"."form_submission" add constraint "form_submission_pkey" PRIMARY KEY using index "form_submission_pkey";

alter table "public"."person" add constraint "person_pkey" PRIMARY KEY using index "person_pkey";

alter table "public"."person_parent" add constraint "person_parent_pkey" PRIMARY KEY using index "person_parent_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."role_permission" add constraint "role_permission_pkey" PRIMARY KEY using index "role_permission_pkey";

alter table "public"."session" add constraint "session_pkey" PRIMARY KEY using index "session_pkey";

alter table "public"."user_roles" add constraint "user_roles_pkey" PRIMARY KEY using index "user_roles_pkey";

alter table "public"."class" add constraint "class_capacity_check" CHECK ((capacity >= 0)) not valid;

alter table "public"."class" validate constraint "class_capacity_check";

alter table "public"."class" add constraint "class_check" CHECK (((enrollment_open_at IS NULL) OR (enrollment_close_at IS NULL) OR (enrollment_open_at < enrollment_close_at))) not valid;

alter table "public"."class" validate constraint "class_check";

alter table "public"."class" add constraint "class_wait_list_capacity_check" CHECK ((wait_list_capacity >= 0)) not valid;

alter table "public"."class" validate constraint "class_wait_list_capacity_check";

alter table "public"."class_enrollment" add constraint "class_enrollment_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.class(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."class_enrollment" validate constraint "class_enrollment_class_id_fkey";

alter table "public"."class_enrollment" add constraint "class_enrollment_class_id_user_id_key" UNIQUE using index "class_enrollment_class_id_user_id_key";

alter table "public"."class_enrollment" add constraint "class_enrollment_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."class_enrollment" validate constraint "class_enrollment_decided_by_fkey";

alter table "public"."class_enrollment" add constraint "class_enrollment_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."class_enrollment" validate constraint "class_enrollment_user_id_fkey";

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

alter table "public"."person" add constraint "person_role_check" CHECK ((role = ANY (ARRAY['parent'::text, 'student'::text]))) not valid;

alter table "public"."person" validate constraint "person_role_check";

alter table "public"."person" add constraint "person_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."person" validate constraint "person_user_id_fkey";

alter table "public"."person_parent" add constraint "person_parent_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.person(id) not valid;

alter table "public"."person_parent" validate constraint "person_parent_parent_id_fkey";

alter table "public"."person_parent" add constraint "person_parent_person_id_fkey" FOREIGN KEY (person_id) REFERENCES public.person(id) not valid;

alter table "public"."person_parent" validate constraint "person_parent_person_id_fkey";

alter table "public"."person_parent" add constraint "person_parent_person_id_parent_id_key" UNIQUE using index "person_parent_person_id_parent_id_key";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."session" add constraint "session_check" CHECK ((starts_at < ends_at)) not valid;

alter table "public"."session" validate constraint "session_check";

alter table "public"."session" add constraint "session_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.class(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."session" validate constraint "session_class_id_fkey";

alter table "public"."user_roles" add constraint "user_roles_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES auth.users(id) not valid;

alter table "public"."user_roles" validate constraint "user_roles_assigned_by_fkey";

alter table "public"."user_roles" add constraint "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_roles" validate constraint "user_roles_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.assignee_can_read_form(p_form_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(
    select 1
    from public.form_assignment fa
    where fa.form_id = p_form_id
      and fa.user_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.authorize(requested_permission public.app_permissions)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  bind_permissions int;
  user_role public.app_role;
begin
  select coalesce(
    nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'), '')::public.app_role,
    'unassigned'::public.app_role
  ) into user_role;

  select count(*)
    into bind_permissions
    from public.role_permission
    where role_permission.permission = requested_permission
      and role_permission.role = user_role;

  return bind_permissions > 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS public.app_role
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'), '')::app_role,
    'unassigned'::app_role
  );
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
  insert into public.user_roles (user_id, role, assigned_by)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'unassigned'),
    new.id
  )
  on conflict (user_id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_completed_required_forms(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  required_count int := 0;
  incomplete_count int := 0;
  result boolean := false;
begin
  select count(*)
    into required_count
    from public.form_assignment fa
    join public.form f on f.id = fa.form_id
    where fa.user_id = p_user_id
      and f.is_required = true;

  if required_count = 0 then
    result := false;
    raise log '[has_completed_required_forms] no required assignments for user %', p_user_id;
    return result;
  end if;

  select count(*)
    into incomplete_count
    from public.form_assignment fa
    join public.form f on f.id = fa.form_id
    where fa.user_id = p_user_id
      and f.is_required = true
      and coalesce(fa.status, 'pending') is distinct from 'submitted';

  result := (incomplete_count = 0);
  raise log '[has_completed_required_forms] user % required_count %, incomplete_count %, result %',
    p_user_id, required_count, incomplete_count, result;

  return result;
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
  raise log '[mark_assignment_submitted] enter form % user %', new.form_id, new.user_id;
  update public.form_assignment
  set status = 'submitted'
  where form_id = new.form_id
    and user_id = new.user_id;
  raise log '[mark_assignment_submitted] updated assignment to submitted';
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
  user_role_current app_role;
  has_completed boolean;
begin
  raise log '[promote_user_after_submission] enter user % form %', new.user_id, new.form_id;

  if not public.should_auto_promote_onboarding() then
    raise log '[promote_user_after_submission] skip: onboarding_mode=permission for user %', new.user_id;
    return new;
  end if;

  -- Mark assignment submitted first so completion check sees latest status.
  update public.form_assignment
  set status = 'submitted'
  where form_id = new.form_id
    and user_id = new.user_id;

  select coalesce(role, 'unassigned'::app_role)
    into user_role_current
    from public.user_roles
    where user_id = new.user_id;

  if user_role_current is distinct from 'unassigned' then
    raise log '[promote_user_after_submission] skip: role is % for user %', user_role_current, new.user_id;
    return new;
  end if;

  select coalesce(public.has_completed_required_forms(new.user_id), false) into has_completed;
  raise log '[promote_user_after_submission] eval user %, current_role %, has_completed %', new.user_id, user_role_current, has_completed;

  if has_completed then
    update public.user_roles
    set role = 'student'
    where user_id = new.user_id;
    raise log '[promote_user_after_submission] promoted user % to student', new.user_id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_class_enrollment_decision_fields()
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
  where fa.form_id = p_form_id
    and not exists (
      select 1
      from public.form f
      join public.user_roles ur on ur.user_id = fa.user_id
      where f.id = fa.form_id
        and ur.role = any (f.auto_assign)
    )
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
  where fa.user_id = p_user_id
    and fa.form_id in (
      select f.id
      from public.form f
      where not (user_role = any (f.auto_assign))
    )
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

CREATE OR REPLACE FUNCTION public.touch_class_enrollment_updated_at()
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

CREATE OR REPLACE FUNCTION public.touch_session_updated_at()
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

grant delete on table "public"."class_enrollment" to "authenticated";

grant insert on table "public"."class_enrollment" to "authenticated";

grant references on table "public"."class_enrollment" to "authenticated";

grant select on table "public"."class_enrollment" to "authenticated";

grant trigger on table "public"."class_enrollment" to "authenticated";

grant truncate on table "public"."class_enrollment" to "authenticated";

grant update on table "public"."class_enrollment" to "authenticated";

grant delete on table "public"."class_enrollment" to "service_role";

grant insert on table "public"."class_enrollment" to "service_role";

grant references on table "public"."class_enrollment" to "service_role";

grant select on table "public"."class_enrollment" to "service_role";

grant trigger on table "public"."class_enrollment" to "service_role";

grant truncate on table "public"."class_enrollment" to "service_role";

grant update on table "public"."class_enrollment" to "service_role";

grant delete on table "public"."class_enrollment" to "supabase_auth_admin";

grant insert on table "public"."class_enrollment" to "supabase_auth_admin";

grant references on table "public"."class_enrollment" to "supabase_auth_admin";

grant select on table "public"."class_enrollment" to "supabase_auth_admin";

grant trigger on table "public"."class_enrollment" to "supabase_auth_admin";

grant truncate on table "public"."class_enrollment" to "supabase_auth_admin";

grant update on table "public"."class_enrollment" to "supabase_auth_admin";

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

grant delete on table "public"."session" to "authenticated";

grant insert on table "public"."session" to "authenticated";

grant references on table "public"."session" to "authenticated";

grant select on table "public"."session" to "authenticated";

grant trigger on table "public"."session" to "authenticated";

grant truncate on table "public"."session" to "authenticated";

grant update on table "public"."session" to "authenticated";

grant delete on table "public"."session" to "service_role";

grant insert on table "public"."session" to "service_role";

grant references on table "public"."session" to "service_role";

grant select on table "public"."session" to "service_role";

grant trigger on table "public"."session" to "service_role";

grant truncate on table "public"."session" to "service_role";

grant update on table "public"."session" to "service_role";

grant delete on table "public"."session" to "supabase_auth_admin";

grant insert on table "public"."session" to "supabase_auth_admin";

grant references on table "public"."session" to "supabase_auth_admin";

grant select on table "public"."session" to "supabase_auth_admin";

grant trigger on table "public"."session" to "supabase_auth_admin";

grant truncate on table "public"."session" to "supabase_auth_admin";

grant update on table "public"."session" to "supabase_auth_admin";

grant delete on table "public"."user_roles" to "authenticated";

grant insert on table "public"."user_roles" to "authenticated";

grant references on table "public"."user_roles" to "authenticated";

grant select on table "public"."user_roles" to "authenticated";

grant trigger on table "public"."user_roles" to "authenticated";

grant truncate on table "public"."user_roles" to "authenticated";

grant update on table "public"."user_roles" to "authenticated";

grant delete on table "public"."user_roles" to "service_role";

grant insert on table "public"."user_roles" to "service_role";

grant references on table "public"."user_roles" to "service_role";

grant select on table "public"."user_roles" to "service_role";

grant trigger on table "public"."user_roles" to "service_role";

grant truncate on table "public"."user_roles" to "service_role";

grant update on table "public"."user_roles" to "service_role";

grant delete on table "public"."user_roles" to "supabase_auth_admin";

grant insert on table "public"."user_roles" to "supabase_auth_admin";

grant references on table "public"."user_roles" to "supabase_auth_admin";

grant select on table "public"."user_roles" to "supabase_auth_admin";

grant trigger on table "public"."user_roles" to "supabase_auth_admin";

grant truncate on table "public"."user_roles" to "supabase_auth_admin";

grant update on table "public"."user_roles" to "supabase_auth_admin";


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



  create policy "class_enrollment_insert_self"
  on "public"."class_enrollment"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (COALESCE(status, 'pending'::public.class_enrollment_status) = 'pending'::public.class_enrollment_status)));



  create policy "class_enrollment_read_auth_admin"
  on "public"."class_enrollment"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "class_enrollment_select_admin"
  on "public"."class_enrollment"
  as permissive
  for select
  to public
using (public.authorize('class_enrollment.read'::public.app_permissions));



  create policy "class_enrollment_select_self"
  on "public"."class_enrollment"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "class_enrollment_update_admin"
  on "public"."class_enrollment"
  as permissive
  for update
  to public
using ((public.authorize('class_enrollment.update'::public.app_permissions) OR public.authorize('class_enrollment.update_status'::public.app_permissions)))
with check ((public.authorize('class_enrollment.update'::public.app_permissions) OR public.authorize('class_enrollment.update_status'::public.app_permissions)));



  create policy "form_assignee_read"
  on "public"."form"
  as permissive
  for select
  to public
using (public.assignee_can_read_form(id));



  create policy "form_delete_authorized"
  on "public"."form"
  as permissive
  for delete
  to public
using (public.authorize('form.delete'::public.app_permissions));



  create policy "form_insert_authorized"
  on "public"."form"
  as permissive
  for insert
  to public
with check (public.authorize('form.create'::public.app_permissions));



  create policy "form_read_auth_admin"
  on "public"."form"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "form_select_authorized"
  on "public"."form"
  as permissive
  for select
  to public
using (public.authorize('form.read'::public.app_permissions));



  create policy "form_update_authorized"
  on "public"."form"
  as permissive
  for update
  to public
using (public.authorize('form.update'::public.app_permissions))
with check (public.authorize('form.update'::public.app_permissions));



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



  create policy "form_answer_delete_authorized"
  on "public"."form_answer"
  as permissive
  for delete
  to public
using (public.authorize('form_answer.delete'::public.app_permissions));



  create policy "form_answer_insert_authorized"
  on "public"."form_answer"
  as permissive
  for insert
  to public
with check (public.authorize('form_answer.create'::public.app_permissions));



  create policy "form_answer_read_auth_admin"
  on "public"."form_answer"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "form_answer_select_authorized"
  on "public"."form_answer"
  as permissive
  for select
  to public
using (public.authorize('form_answer.read'::public.app_permissions));



  create policy "form_answer_update_authorized"
  on "public"."form_answer"
  as permissive
  for update
  to public
using (public.authorize('form_answer.update'::public.app_permissions))
with check (public.authorize('form_answer.update'::public.app_permissions));



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



  create policy "form_assignment_delete_authorized"
  on "public"."form_assignment"
  as permissive
  for delete
  to public
using (public.authorize('form_assignment.delete'::public.app_permissions));



  create policy "form_assignment_insert_authorized"
  on "public"."form_assignment"
  as permissive
  for insert
  to public
with check (public.authorize('form_assignment.create'::public.app_permissions));



  create policy "form_assignment_read_auth_admin"
  on "public"."form_assignment"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "form_assignment_select_authorized"
  on "public"."form_assignment"
  as permissive
  for select
  to public
using (public.authorize('form_assignment.read'::public.app_permissions));



  create policy "form_assignment_self_insert"
  on "public"."form_assignment"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.form f
  WHERE ((f.id = form_assignment.form_id) AND (public.current_user_role() = ANY (f.auto_assign)))))));



  create policy "form_assignment_update_authorized"
  on "public"."form_assignment"
  as permissive
  for update
  to public
using (public.authorize('form_assignment.update'::public.app_permissions))
with check (public.authorize('form_assignment.update'::public.app_permissions));



  create policy "form_question_assignee_read"
  on "public"."form_question"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.form_assignment fa
  WHERE ((fa.form_id = form_question.form_id) AND (fa.user_id = auth.uid())))));



  create policy "form_question_delete_authorized"
  on "public"."form_question"
  as permissive
  for delete
  to public
using (public.authorize('form_question.delete'::public.app_permissions));



  create policy "form_question_insert_authorized"
  on "public"."form_question"
  as permissive
  for insert
  to public
with check (public.authorize('form_question.create'::public.app_permissions));



  create policy "form_question_read_auth_admin"
  on "public"."form_question"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "form_question_select_authorized"
  on "public"."form_question"
  as permissive
  for select
  to public
using (public.authorize('form_question.read'::public.app_permissions));



  create policy "form_question_update_authorized"
  on "public"."form_question"
  as permissive
  for update
  to public
using (public.authorize('form_question.update'::public.app_permissions))
with check (public.authorize('form_question.update'::public.app_permissions));



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



  create policy "form_submission_delete_authorized"
  on "public"."form_submission"
  as permissive
  for delete
  to public
using (public.authorize('form_submission.delete'::public.app_permissions));



  create policy "form_submission_insert_authorized"
  on "public"."form_submission"
  as permissive
  for insert
  to public
with check (public.authorize('form_submission.create'::public.app_permissions));



  create policy "form_submission_read_auth_admin"
  on "public"."form_submission"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "form_submission_select_authorized"
  on "public"."form_submission"
  as permissive
  for select
  to public
using (public.authorize('form_submission.read'::public.app_permissions));



  create policy "form_submission_update_authorized"
  on "public"."form_submission"
  as permissive
  for update
  to public
using (public.authorize('form_submission.update'::public.app_permissions))
with check (public.authorize('form_submission.update'::public.app_permissions));



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



  create policy "role_permission_admin_manage"
  on "public"."role_permission"
  as permissive
  for all
  to public
using (public.authorize('role_permission.manage'::public.app_permissions))
with check (public.authorize('role_permission.manage'::public.app_permissions));



  create policy "role_permission_read_auth_admin"
  on "public"."role_permission"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "session_delete_admin"
  on "public"."session"
  as permissive
  for delete
  to public
using (public.authorize('class.delete'::public.app_permissions));



  create policy "session_insert_admin"
  on "public"."session"
  as permissive
  for insert
  to public
with check (public.authorize('class.create'::public.app_permissions));



  create policy "session_read_auth_admin"
  on "public"."session"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "session_select_all"
  on "public"."session"
  as permissive
  for select
  to public
using (true);



  create policy "session_update_admin"
  on "public"."session"
  as permissive
  for update
  to public
using (public.authorize('class.update'::public.app_permissions))
with check (public.authorize('class.update'::public.app_permissions));



  create policy "user_roles_read_auth_admin"
  on "public"."user_roles"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "user_roles_read_self"
  on "public"."user_roles"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "user_roles_write_admin"
  on "public"."user_roles"
  as permissive
  for all
  to public
using (public.authorize('user_roles.manage'::public.app_permissions))
with check (public.authorize('user_roles.manage'::public.app_permissions));


CREATE TRIGGER on_class_updated_set_timestamp BEFORE UPDATE ON public.class FOR EACH ROW EXECUTE FUNCTION public.touch_class_updated_at();

CREATE TRIGGER on_class_enrollment_set_decision_fields BEFORE UPDATE ON public.class_enrollment FOR EACH ROW EXECUTE FUNCTION public.set_class_enrollment_decision_fields();

CREATE TRIGGER on_class_enrollment_updated_set_timestamp BEFORE UPDATE ON public.class_enrollment FOR EACH ROW EXECUTE FUNCTION public.touch_class_enrollment_updated_at();

CREATE TRIGGER on_form_auto_assign_changed_sync_assignments AFTER UPDATE OF auto_assign ON public.form FOR EACH ROW EXECUTE FUNCTION public.sync_auto_assigned_forms_for_form_trigger();

CREATE TRIGGER on_form_created_sync_assignments AFTER INSERT ON public.form FOR EACH ROW EXECUTE FUNCTION public.sync_auto_assigned_forms_for_form_trigger();

CREATE TRIGGER on_form_updated_set_timestamp BEFORE UPDATE ON public.form FOR EACH ROW EXECUTE FUNCTION public.touch_form_updated_at();

CREATE TRIGGER on_form_submission_auto_promote AFTER INSERT OR UPDATE ON public.form_submission FOR EACH ROW EXECUTE FUNCTION public.promote_user_after_submission();

CREATE TRIGGER on_form_submission_mark_assignment AFTER INSERT OR UPDATE ON public.form_submission FOR EACH ROW EXECUTE FUNCTION public.mark_assignment_submitted();

CREATE TRIGGER on_profile_updated_set_timestamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_profile_updated_at();

CREATE TRIGGER on_session_updated_set_timestamp BEFORE UPDATE ON public.session FOR EACH ROW EXECUTE FUNCTION public.touch_session_updated_at();

CREATE TRIGGER on_user_role_changed_sync_forms AFTER INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.sync_auto_assigned_forms_for_user_trigger();

CREATE TRIGGER on_auth_user_created_create_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

CREATE TRIGGER on_auth_user_created_set_role AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();


