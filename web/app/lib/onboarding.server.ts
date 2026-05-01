import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/database.types'
import { adminClient } from '@/lib/supabase/adminClient'
import { getSignUpFlowContext } from '@/lib/sign-up-flow-context.server'

export type SignUpDetailsStatus = {
  isComplete: boolean
  profileId: string | null
  role: string | null
  waitingOnGuardians?: boolean
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

const isConditionMet = (condition: Json | null | undefined, answers: Record<string, Json>): boolean => {
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
  submissions: Array<{
    form_id: string | null
    submitted_at: string | null
    form_answer: Array<{ question_code: string | null; value: Json }> | null
  }>
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

export const getProfileSignUpCompletion = async (
  supabase: SupabaseClient<Database>,
  profileId: string,
  role: Database['public']['Enums']['app_role'],
  options: { skipSlugs?: string[] } = {}
): Promise<boolean> => {
  const { data: submissions } = await supabase
    .from('form_submission')
    .select('form_id, submitted_at, form_answer ( question_code, value )')
    .eq('profile_id', profileId)
    .order('submitted_at', { ascending: true })

  const answers = buildAnswerMapFromSubmissions(submissions ?? [])
  const submittedFormIds = new Set((submissions ?? []).map(submission => submission.form_id).filter(Boolean))

  const { data: flowEntries } = await supabase
    .from('sign_up_flow')
    .select('form_id, roles, condition, slug')
    .order('step_order')

  const relevantForms = (flowEntries ?? [])
    .filter(entry => entry.roles?.includes(role))
    .filter(entry => isConditionMet(entry.condition as Json, answers))
    .filter(entry => !(options.skipSlugs ?? []).includes(entry.slug ?? ''))
    .map(entry => entry.form_id)
    .filter(Boolean)

  if (!relevantForms.length) {
    return false
  }

  const formsComplete = relevantForms.every(formId => submittedFormIds.has(formId))
  if (!formsComplete) {
    return false
  }

  if (role === 'guardian') {
    const { data: relationship } = await supabase
      .from('person_guardian_child')
      .select('id')
      .eq('guardian_profile_id', profileId)
      .limit(1)
      .maybeSingle()
    return Boolean(relationship?.id)
  }

  return true
}

export const getProfileSignUpCompletionWithContext = async (
  supabase: SupabaseClient<Database>,
  profileId: string,
  role: Database['public']['Enums']['app_role']
): Promise<boolean> => {
  if (role !== 'guardian' && role !== 'student') {
    return getProfileSignUpCompletion(supabase, profileId, role)
  }

  const { data: profile } = await supabase
    .from('profile')
    .select('email')
    .eq('id', profileId)
    .maybeSingle()

  const signUpFlowContext = await getSignUpFlowContext(supabase, {
    email: profile?.email ?? null,
    role,
  })

  return getProfileSignUpCompletion(
    supabase,
    profileId,
    role,
    signUpFlowContext.skipSlugs.length ? { skipSlugs: signUpFlowContext.skipSlugs } : undefined
  )
}

export async function getSignUpDetailsStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  roleOverride?: string | null
): Promise<SignUpDetailsStatus> {
  const { data: profile, error } = await supabase
    .from('profile')
    .select('id, role, email')
    .eq('user_id', userId)
    .single()

  if (error || !profile?.id) {
    return {
      isComplete: false,
      profileId: null,
      role: roleOverride ?? null,
      waitingOnGuardians: false,
    }
  }

  const role = roleOverride && roleOverride !== 'unassigned' ? roleOverride : profile.role ?? roleOverride ?? null
  if (!role || role === 'unassigned') {
    return { isComplete: false, profileId: profile.id, role, waitingOnGuardians: false }
  }
  const formsComplete = await getProfileSignUpCompletionWithContext(
    supabase,
    profile.id,
    role as Database['public']['Enums']['app_role']
  )

  if (role === 'student') {
    const { data: guardians } = await supabase
      .from('person_guardian_child')
      .select('guardian_profile_id')
      .eq('child_profile_id', profile.id)

    const guardianIds = (guardians ?? []).map(row => row.guardian_profile_id).filter(Boolean)
    if (!guardianIds.length) {
      return {
        isComplete: false,
        profileId: profile.id,
        role,
        waitingOnGuardians: formsComplete,
      }
    }

    const guardianCompletions = await Promise.all(
      guardianIds.map(guardianId =>
        getProfileSignUpCompletionWithContext(adminClient, guardianId, 'guardian')
      )
    )
    const hasCompleteGuardian = guardianCompletions.some(Boolean)
    return {
      isComplete: formsComplete && hasCompleteGuardian,
      profileId: profile.id,
      role,
      waitingOnGuardians: formsComplete && !hasCompleteGuardian,
    }
  }

  return {
    isComplete: formsComplete,
    profileId: profile.id,
    role,
    waitingOnGuardians: false,
  }
}
