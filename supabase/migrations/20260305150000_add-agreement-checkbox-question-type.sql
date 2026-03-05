ALTER TYPE public.form_question_type ADD VALUE IF NOT EXISTS 'agreement';
ALTER TYPE public.form_question_type ADD VALUE IF NOT EXISTS 'checkbox';
ALTER TABLE public.form_question RENAME COLUMN kind TO "type";
