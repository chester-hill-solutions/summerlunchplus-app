alter table if exists public.email_change_log
drop constraint if exists email_change_log_old_new_different_chk;
