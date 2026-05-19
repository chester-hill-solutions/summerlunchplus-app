import { adminClient } from '@/lib/supabase/adminClient'

export type SemesterSurveyKind = 'pre_program_survey' | 'post_program_survey'

type SemesterSurveyForm = {
  formId: string | null
  required: boolean
}

export const resolveSemesterSurveyForm = async (
  semesterId: string,
  kind: SemesterSurveyKind
): Promise<SemesterSurveyForm> => {
  const { data: mapped } = await adminClient
    .from('semester_form_requirement')
    .select('form_id, is_required')
    .eq('semester_id', semesterId)
    .eq('kind', kind)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (mapped?.form_id) {
    return {
      formId: mapped.form_id,
      required: mapped.is_required !== false,
    }
  }

  return {
    formId: null,
    required: true,
  }
}
