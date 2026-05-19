import { adminClient } from '@/lib/supabase/adminClient'

export type SemesterSurveyKind = 'pre_program_survey' | 'post_program_survey'

const legacyKindFor = (kind: SemesterSurveyKind) => {
  if (kind === 'pre_program_survey') return 'pre_survey'
  return 'post_survey'
}

type SemesterSurveyForm = {
  formId: string | null
  required: boolean
}

export const resolveSemesterSurveyForm = async (
  semesterId: string,
  kind: SemesterSurveyKind
): Promise<SemesterSurveyForm> => {
  const kindCandidates = [kind, legacyKindFor(kind)]

  for (const candidateKind of kindCandidates) {
    const { data: mapped, error } = await adminClient
      .from('semester_form_requirement')
      .select('form_id, is_required')
      .eq('semester_id', semesterId)
      .eq('kind', candidateKind as never)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (mapped?.form_id) {
      return {
        formId: mapped.form_id,
        required: mapped.is_required !== false,
      }
    }

    if (!error) {
      continue
    }

    const code = typeof error.code === 'string' ? error.code : ''
    if (code !== '22P02') {
      break
    }
  }

  return {
    formId: null,
    required: true,
  }
}
