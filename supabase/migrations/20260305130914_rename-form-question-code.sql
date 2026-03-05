alter table "public"."form_question" add column "question_code" text;

update "public"."form_question" set question_code = id::text;

alter table "public"."form_answer" add column "question_code" text;

update "public"."form_answer" set question_code = question_id::text;

alter table "public"."form_answer" drop constraint "form_answer_question_id_fkey";

alter table "public"."form_answer" drop constraint "form_answer_submission_id_question_id_key";

alter table "public"."form_question" drop constraint "form_question_pkey";

drop index if exists "public"."form_answer_submission_id_question_id_key";

drop index if exists "public"."form_question_pkey";

alter table "public"."form_answer" drop column "question_id";

alter table "public"."form_question" drop column "id";

alter table "public"."form_question" add constraint "form_question_pkey" PRIMARY KEY (question_code);

alter table "public"."form_answer" alter column "question_code" set not null;
alter table "public"."form_question" alter column "question_code" set not null;

CREATE UNIQUE INDEX form_answer_submission_id_question_code_key ON public.form_answer USING btree (submission_id, question_code);

alter table "public"."form_answer" add constraint "form_answer_question_code_fkey" FOREIGN KEY (question_code) REFERENCES public.form_question(question_code) ON DELETE CASCADE not valid;

alter table "public"."form_answer" validate constraint "form_answer_question_code_fkey";

alter table "public"."form_answer" add constraint "form_answer_submission_id_question_code_key" UNIQUE using index "form_answer_submission_id_question_code_key";

