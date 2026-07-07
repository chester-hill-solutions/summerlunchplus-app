import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/database.types'
import { getEmailDomainHint } from '@/lib/email-domain'
import { loadSubmissionAnswerState } from '@/lib/form-submission-answers.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { getSignUpFlowContext } from '@/lib/sign-up-flow-context.server'

const SIGN_UP_FLOW_CACHE_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 30_000
let signUpFlowCache: {
  fetchedAt: number
  rows: Array<{ form_id: string | null; roles: string[] | null; condition: Json | null; slug: string | null }>
} | null = null

const shouldLogOnboardingInstrumentation =
  process.env.NODE_ENV !== 'production' || process.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

const getCachedSignUpFlowEntries = async (supabase: SupabaseClient<Database>) => {
  const now = Date.now()
  if (signUpFlowCache && now - signUpFlowCache.fetchedAt < SIGN_UP_FLOW_CACHE_TTL_MS) {
    return signUpFlowCache.rows
  }

  const { data: flowEntries } = await supabase
    .from('sign_up_flow')
    .select('form_id, roles, condition, slug')
    .order('step_order')

  const rows = (flowEntries ?? []) as Array<{ form_id: string | null; roles: string[] | null; condition: Json | null; slug: string | null }>
  signUpFlowCache = {
    fetchedAt: now,
    rows,
  }
  return rows
}

export type SignUpDetailsStatus = {
  isComplete: boolean
  profileId: string | null
  role: string | null
  waitingOnGuardians?: boolean
}

const isSignUpDetailsRole = (role: string | null | undefined): role is 'guardian' | 'student' =>
  role === 'guardian' || role === 'student'

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

export const getProfileSignUpCompletion = async (
  supabase: SupabaseClient<Database>,
  profileId: string,
  role: Database['public']['Enums']['app_role'],
  options: { skipSlugs?: string[] } = {}
): Promise<boolean> => {
  const startedAt = Date.now()
  const { answers, submissions } = await loadSubmissionAnswerState(supabase, profileId)
  const submittedFormIds = new Set(submissions.map(submission => submission.form_id).filter(Boolean))

  const flowEntries = await getCachedSignUpFlowEntries(supabase)

  const relevantForms = (flowEntries ?? [])
    .filter(entry => entry.roles?.includes(role))
    .filter(entry => isConditionMet(entry.condition as Json, answers))
    .filter(entry => !(options.skipSlugs ?? []).includes(entry.slug ?? ''))
    .map(entry => entry.form_id)
    .filter((formId): formId is string => Boolean(formId))

  if (!relevantForms.length) {
    return true
  }

  const formsComplete = relevantForms.every(formId => submittedFormIds.has(formId))
  if (!formsComplete) {
    if (shouldLogOnboardingInstrumentation) {
      console.info('[onboarding-instrumentation]', {
        event: 'profile_sign_up_completion_incomplete',
        profileId,
        role,
        relevantFormCount: relevantForms.length,
        submittedFormCount: submittedFormIds.size,
        durationMs: Date.now() - startedAt,
      })
    }
    return false
  }

  if (role === 'guardian') {
    const { data: relationship } = await supabase
      .from('person_guardian_child')
      .select('id')
      .eq('guardian_profile_id', profileId)
      .limit(1)
      .maybeSingle()
    const complete = Boolean(relationship?.id)
    if (shouldLogOnboardingInstrumentation) {
      console.info('[onboarding-instrumentation]', {
        event: 'profile_sign_up_completion_guardian',
        profileId,
        complete,
        durationMs: Date.now() - startedAt,
      })
    }
    return complete
  }

  if (shouldLogOnboardingInstrumentation) {
    console.info('[onboarding-instrumentation]', {
      event: 'profile_sign_up_completion_complete',
      profileId,
      role,
      durationMs: Date.now() - startedAt,
    })
  }

  return true
}

export const getProfileSignUpCompletionWithContext = async (
  supabase: SupabaseClient<Database>,
  profileId: string,
  role: Database['public']['Enums']['app_role'],
  options: { email?: string | null } = {}
): Promise<boolean> => {
  if (role !== 'guardian' && role !== 'student') {
    return getProfileSignUpCompletion(supabase, profileId, role)
  }

  let email = options.email ?? null
  if (!email) {
    const { data: profile } = await supabase
      .from('profile')
      .select('email')
      .eq('id', profileId)
      .maybeSingle()
    email = profile?.email ?? null
  }

  const signUpFlowContext = await getSignUpFlowContext(supabase, {
    email,
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
  const startedAt = Date.now()
  const { data: profile, error } = await supabase
    .from('profile')
    .select('id, role, email')
    .eq('user_id', userId)
    .single()

  if (error || !profile?.id) {
    if (shouldLogOnboardingInstrumentation) {
      console.info('[onboarding-instrumentation]', {
        event: 'signup_status_missing_profile',
        emailDomainHint: null,
        roleOverride: roleOverride ?? null,
        durationMs: Date.now() - startedAt,
      })
    }
    return {
      isComplete: false,
      profileId: null,
      role: roleOverride ?? null,
      waitingOnGuardians: false,
    }
  }

  const role = roleOverride && roleOverride !== 'unassigned' ? roleOverride : profile.role ?? roleOverride ?? null
  const emailDomainHint = getEmailDomainHint(profile.email)
  if (!role || role === 'unassigned') {
    if (shouldLogOnboardingInstrumentation) {
      console.info('[onboarding-instrumentation]', {
        event: 'signup_status_unassigned',
        emailDomainHint,
        profileId: profile.id,
        durationMs: Date.now() - startedAt,
      })
    }
    return { isComplete: false, profileId: profile.id, role, waitingOnGuardians: false }
  }

  if (!isSignUpDetailsRole(role)) {
    if (shouldLogOnboardingInstrumentation) {
      console.info('[onboarding-instrumentation]', {
        event: 'signup_status_non_signup_role_complete',
        emailDomainHint,
        profileId: profile.id,
        role,
        durationMs: Date.now() - startedAt,
      })
    }
    return { isComplete: true, profileId: profile.id, role, waitingOnGuardians: false }
  }

  const formsComplete = await getProfileSignUpCompletionWithContext(
    supabase,
    profile.id,
    role,
    { email: profile.email ?? null }
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

    const { data: guardianProfiles } = await adminClient
      .from('profile')
      .select('id, email')
      .in('id', guardianIds)

    const guardianEmailById = new Map(
      (guardianProfiles ?? []).map(row => [row.id, row.email ?? null])
    )

    const guardianCompletions = await Promise.all(
      guardianIds.map(guardianId =>
        getProfileSignUpCompletionWithContext(adminClient, guardianId, 'guardian', {
          email: guardianEmailById.get(guardianId) ?? null,
        })
      )
    )
    const hasCompleteGuardian = guardianCompletions.some(Boolean)
    const result = {
      isComplete: formsComplete && hasCompleteGuardian,
      profileId: profile.id,
      role,
      waitingOnGuardians: formsComplete && !hasCompleteGuardian,
    }
    if (shouldLogOnboardingInstrumentation) {
      console.info('[onboarding-instrumentation]', {
        event: 'signup_status_student',
        emailDomainHint,
        profileId: profile.id,
        formsComplete,
        guardianCount: guardianIds.length,
        hasCompleteGuardian,
        durationMs: Date.now() - startedAt,
      })
    }
    return result
  }

  const result = {
    isComplete: formsComplete,
    profileId: profile.id,
    role,
    waitingOnGuardians: false,
  }
  if (shouldLogOnboardingInstrumentation) {
    console.info('[onboarding-instrumentation]', {
      event: 'signup_status_guardian',
      emailDomainHint,
      profileId: profile.id,
      formsComplete,
      durationMs: Date.now() - startedAt,
    })
  }
  return result
}
