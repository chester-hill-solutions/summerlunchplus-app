import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/database.types'

export type SignUpDetailsStatus = {
  isComplete: boolean
  profileId: string | null
  role: string | null
}

type Condition = {
  all?: Condition[]
  any?: Condition[]
  question_code?: string
  equals?: Json
  not_equals?: Json
  includes?: Json
  truthy?: boolean
}

const isConditionMet = (condition: Json | null | undefined, answers: Record<string, Json>) => {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return true
  const normalized = condition as Condition

  if (Array.isArray(normalized.all)) {
    return normalized.all.every(entry => isConditionMet(entry as Json, answers))
  }
  if (Array.isArray(normalized.any)) {
    return normalized.any.some(entry => isConditionMet(entry as Json, answers))
  }

  if (!normalized.question_code) return true
  const value = answers[normalized.question_code]

  if (Object.prototype.hasOwnProperty.call(normalized, 'equals')) {
    return value === normalized.equals
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'not_equals')) {
    return value !== normalized.not_equals
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'includes')) {
    return Array.isArray(value) && value.includes(normalized.includes as string)
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'truthy')) {
    return Boolean(value)
  }
  return true
}

const buildAnswerMapFromSubmissions = (
  submissions: Array<{ form_id: string | null; form_answer: Array<{ question_code: string | null; value: Json }> | null }>
) => {
  const answers: Record<string, Json> = {}

  for (const submission of submissions) {
    for (const answer of submission.form_answer ?? []) {
      if (!answer.question_code) continue
      answers[answer.question_code] = answer.value
    }
  }

  return answers
}

export async function getSignUpDetailsStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  roleOverride?: string | null
): Promise<SignUpDetailsStatus> {
  const { data: profile, error } = await supabase
    .from('profile')
    .select('id, role')
    .eq('user_id', userId)
    .single()

  if (error || !profile?.id) {
    return { isComplete: false, profileId: null, role: roleOverride ?? null }
  }

  const role = roleOverride && roleOverride !== 'unassigned' ? roleOverride : profile.role ?? roleOverride ?? null
  if (!role || role === 'unassigned') {
    return { isComplete: false, profileId: profile.id, role }
  }

  const { data: submissions } = await supabase
    .from('form_submission')
    .select('form_id, form_answer ( question_code, value )')
    .eq('profile_id', profile.id)

  const answers = buildAnswerMapFromSubmissions(submissions ?? [])
  const submittedFormIds = new Set((submissions ?? []).map(submission => submission.form_id).filter(Boolean))

  const { data: flowEntries } = await supabase
    .from('sign_up_flow')
    .select('form_id, roles, condition')
    .order('step_order')

  const relevantForms = (flowEntries ?? [])
    .filter(entry => entry.roles?.includes(role as Database['public']['Enums']['app_role']))
    .filter(entry => isConditionMet(entry.condition as Json, answers))
    .map(entry => entry.form_id)
    .filter(Boolean)

  const formsComplete = relevantForms.length > 0 && relevantForms.every(formId => submittedFormIds.has(formId))

  if (role === 'guardian') {
    const { data: relationship } = await supabase
      .from('person_guardian_child')
      .select('id')
      .eq('guardian_profile_id', profile.id)
      .limit(1)
      .maybeSingle()
    const hasChildLink = Boolean(relationship?.id)
    return { isComplete: formsComplete && hasChildLink, profileId: profile.id, role }
  }

  return { isComplete: formsComplete, profileId: profile.id, role }
}
