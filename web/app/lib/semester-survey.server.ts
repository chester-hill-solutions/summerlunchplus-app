import { adminClient } from '@/lib/supabase/adminClient'

export type SemesterSurveyKind = 'pre_survey' | 'post_survey'

type SemesterSurveyForm = {
  formId: string | null
  required: boolean
}

const LEGACY_PREFIX_BY_KIND: Record<SemesterSurveyKind, string> = {
  pre_survey: 'Pre-Semester Survey - ',
  post_survey: 'Post-Semester Survey - ',
}

export const getLegacySemesterSurveyFormName = (semesterId: string, kind: SemesterSurveyKind) =>
  `${LEGACY_PREFIX_BY_KIND[kind]}${semesterId}`

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

  const legacyName = getLegacySemesterSurveyFormName(semesterId, kind)
  const { data: legacyForm } = await adminClient
    .from('form')
    .select('id')
    .eq('name', legacyName)
    .maybeSingle()

  return {
    formId: legacyForm?.id ?? null,
    required: true,
  }
}
