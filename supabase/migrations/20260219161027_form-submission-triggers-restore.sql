CREATE TRIGGER on_form_submission_auto_promote AFTER INSERT OR UPDATE ON public.form_submission FOR EACH ROW EXECUTE FUNCTION public.promote_user_after_submission();

CREATE TRIGGER on_form_submission_mark_assignment AFTER INSERT OR UPDATE ON public.form_submission FOR EACH ROW EXECUTE FUNCTION public.mark_assignment_submitted();


