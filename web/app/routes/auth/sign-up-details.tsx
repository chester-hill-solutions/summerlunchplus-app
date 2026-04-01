import { adminClient } from '@/lib/supabase/adminClient'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import FormQuestion, { type FormQuestionData } from '@/components/forms/form-question'
import type { Database, Json } from '@/lib/database.types'
import { getProfileSignUpCompletion } from '@/lib/onboarding.server'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { redirect, useFetcher, useLoaderData } from 'react-router'
import { type FormEventHandler, useEffect, useMemo, useState } from 'react'

type FormStep = {
  formId: string
  name: string
  slug: string
  position: number
  status: Database['public']['Enums']['form_assignment_status']
}

type LoaderData = {
  role: 'guardian' | 'student'
  pid: string
  formSteps: FormStep[]
  currentForm: FormStep | null
  currentFormQuestions: FormQuestionData[]
  currentFormAnswers: Record<string, Json>
  allAnswers: Record<string, Json>
  currentFormIndex: number | null
  totalFormSteps: number
  formsComplete: boolean
  guardianStatus?: {
    id: string
    firstname: string | null
    surname: string | null
    email: string | null
    isComplete: boolean
  }[]
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

const mergeAnswerMaps = (...maps: Array<Record<string, Json> | undefined>) =>
  maps.reduce<Record<string, Json>>((acc, entry) => {
    if (!entry) return acc
    for (const [key, value] of Object.entries(entry)) {
      acc[key] = value
    }
    return acc
  }, {})

const normalizeString = (value: Json) => (typeof value === 'string' ? value.trim() : '')

const parseFormValue = (question: FormQuestionData, formData: FormData) => {
  const metadata = (question.metadata ?? {}) as Record<string, Json>
  const inputType = typeof metadata.input_type === 'string' ? metadata.input_type : null
  const fieldName = `question_${question.question_code}`

  if (question.type === 'multi_choice') {
    const choices = formData
      .getAll(fieldName)
      .filter((value): value is string => typeof value === 'string')
    return choices.length ? choices : null
  }

  if (question.type === 'checkbox') {
    return formData.has(fieldName)
  }

  const rawValue = (formData.get(fieldName) as string | null)?.trim() ?? ''
  if (!rawValue) return null

  if (inputType === 'number') {
    const parsed = Number(rawValue)
    return Number.isNaN(parsed) ? null : parsed
  }

  return rawValue
}

const buildAnswerMapFromSubmissions = (submissions: Array<{ form_id: string | null; form_answer: Array<{ question_code: string | null; value: Json }> | null }>) => {
  const answers: Record<string, Json> = {}
  const byForm: Record<string, Record<string, Json>> = {}

  for (const submission of submissions) {
    if (!submission.form_id) continue
    const formAnswers: Record<string, Json> = {}
    for (const answer of submission.form_answer ?? []) {
      if (!answer.question_code) continue
      formAnswers[answer.question_code] = answer.value
      answers[answer.question_code] = answer.value
    }
    byForm[submission.form_id] = formAnswers
  }

  return { answers, byForm }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw redirect('/auth/sign-up', { headers })

  const url = new URL(request.url)
  const requestedFormId = url.searchParams.get('form_id')
  const roleParam = url.searchParams.get('role') as 'guardian' | 'student' | null
  const pidParam = url.searchParams.get('pid')

  let pid = pidParam
  if (!pid) {
    const { data: profileCandidate } = await supabase
      .from('profile')
      .select('id, role')
      .eq('user_id', userData.user.id)
      .single()
    if (!profileCandidate?.id) throw redirect('/auth/sign-up', { headers })
    pid = profileCandidate.id
  }
  if (!pid) throw redirect('/auth/sign-up', { headers })

  const { data: profile } = await supabase
    .from('profile')
    .select('role')
    .eq('id', pid)
    .single()
  if (!profile?.role) throw redirect('/auth/sign-up', { headers })

  const resolvedRole = (roleParam ?? (profile.role as 'guardian' | 'student')) as 'guardian' | 'student'

  const { data: submissions } = await supabase
    .from('form_submission')
    .select('form_id, form_answer ( question_code, value )')
    .eq('profile_id', pid)
  const submissionData = buildAnswerMapFromSubmissions(submissions ?? [])

  const { data: flowEntries } = await supabase
    .from('sign_up_flow')
    .select('slug, step_order, roles, form_id, condition, form ( id, name )')
    .order('step_order')
  const normalizedFlowEntries = (flowEntries ?? [])
    .map(entry => ({
      ...entry,
      form: Array.isArray(entry.form) ? entry.form[0] ?? null : entry.form,
    }))
    .filter(entry => entry.roles?.includes(resolvedRole))
    .filter(entry => isConditionMet(entry.condition as Json, submissionData.answers))

  const formIds = normalizedFlowEntries.map(entry => entry.form_id)
  const { data: assignments } = formIds.length
    ? await supabase
        .from('form_assignment')
        .select('form_id, status')
        .eq('user_id', userData.user.id)
        .in('form_id', formIds)
    : { data: [] }
  const assignmentMap = new Map(
    (assignments ?? []).map(assignment => [assignment.form_id, assignment.status ?? 'pending'])
  )

  const formSteps: FormStep[] = normalizedFlowEntries.map(entry => ({
    formId: entry.form_id,
    name: entry.form?.name ?? 'Required information',
    slug: entry.slug,
    position: entry.step_order,
    status: (assignmentMap.get(entry.form_id) ?? 'pending') as Database['public']['Enums']['form_assignment_status'],
  }))

  const firstPending = formSteps.find(step => step.status !== 'submitted') ?? null
  const requestedForm = requestedFormId
    ? formSteps.find(step => step.formId === requestedFormId && step.status !== 'submitted') ?? null
    : null
  const currentForm = requestedForm ?? firstPending
  const currentFormIndex = currentForm
    ? formSteps.findIndex(step => step.formId === currentForm.formId) + 1
    : null

  let currentFormQuestions: FormQuestionData[] = []
  let currentFormAnswers: Record<string, Json> = {}
  if (currentForm) {
    const { data: questions } = await supabase
      .from('form_question_map')
      .select(
        'question_code, position, prompt_override, options_override, metadata, visibility_condition, form_question ( prompt, type, options )'
      )
      .eq('form_id', currentForm.formId)
      .order('position')
    currentFormQuestions = (questions ?? []).map(q => {
      const base = Array.isArray(q.form_question) ? q.form_question[0] : q.form_question
      return {
        question_code: q.question_code ?? '',
        prompt: q.prompt_override ?? base?.prompt ?? '',
        type: (base?.type ?? 'text') as Database['public']['Enums']['form_question_type'],
        options: (q.options_override ?? base?.options ?? []) as Json,
        metadata: (q.metadata ?? {}) as Json,
        visibility_condition: (q.visibility_condition ?? null) as Json,
      }
    })
    currentFormAnswers = submissionData.byForm[currentForm.formId] ?? {}
  }

  const formsComplete = formSteps.length === 0 || formSteps.every(step => step.status === 'submitted')

  let guardianStatus: LoaderData['guardianStatus']
  let waitingOnGuardians = false

  if (resolvedRole === 'student') {
    const { data: guardianLinks } = await supabase
      .from('person_guardian_child')
      .select('guardian_profile_id')
      .eq('child_profile_id', pid)

    const guardianIds = (guardianLinks ?? []).map(link => link.guardian_profile_id).filter(Boolean)
    if (guardianIds.length) {
      const { data: guardians } = await supabase
        .from('profile')
        .select('id, firstname, surname, email')
        .in('id', guardianIds)

      guardianStatus = await Promise.all(
        (guardians ?? []).map(async guardian => ({
          ...guardian,
          isComplete: await getProfileSignUpCompletion(supabase, guardian.id, 'guardian'),
        }))
      )
      waitingOnGuardians = guardianStatus.some(guardian => !guardian.isComplete)
    } else {
      waitingOnGuardians = true
    }
  }

  if (formsComplete && !(resolvedRole === 'student' && waitingOnGuardians)) {
    return redirect('/home', { headers })
  }

  return {
    role: resolvedRole,
    pid,
    formSteps,
    currentForm,
    currentFormQuestions,
    currentFormAnswers,
    allAnswers: submissionData.answers,
    currentFormIndex,
    totalFormSteps: formSteps.length,
    formsComplete,
    guardianStatus,
    waitingOnGuardians,
  }
}

const ensureGuardianChildLink = async (guardianId: string, childId: string, primaryChild: boolean) => {
  await adminClient
    .from('person_guardian_child')
    .upsert(
      {
        guardian_profile_id: guardianId,
        child_profile_id: childId,
        primary_child: primaryChild,
      },
      { onConflict: 'guardian_profile_id,child_profile_id' }
    )
}

const resolveRelationship = async (supabase: ReturnType<typeof createClient>['supabase'], role: 'guardian' | 'student', pid: string) => {
  if (role === 'guardian') {
    const { data } = await supabase
      .from('person_guardian_child')
      .select('child_profile_id')
      .eq('guardian_profile_id', pid)
      .eq('primary_child', true)
      .maybeSingle()
    return { guardianPid: pid, childPid: data?.child_profile_id ?? null }
  }

  const { data } = await supabase
    .from('person_guardian_child')
    .select('guardian_profile_id')
    .eq('child_profile_id', pid)
    .eq('primary_child', true)
    .maybeSingle()
  return { guardianPid: data?.guardian_profile_id ?? null, childPid: pid }
}

const sendInvite = async ({
  email,
  role,
  origin,
  inviterPid,
  inviterRole,
  inviterEmail,
  inviterUserId,
}: {
  email: string
  role: 'guardian' | 'student'
  origin: string
  inviterPid: string
  inviterRole: 'guardian' | 'student'
  inviterEmail: string
  inviterUserId: string
}) => {
  const redirectTo = `${origin}/auth/sign-up-details?role=${role}`
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      inviter_profile_id: inviterPid,
      inviter_role: inviterRole,
      inviter_email: inviterEmail,
      role,
    },
  })

  let inviteeUserId = inviteData?.user?.id ?? null
  if (inviteError) {
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo,
        data: {
          inviter_profile_id: inviterPid,
          inviter_role: inviterRole,
          inviter_email: inviterEmail,
          role,
        },
      },
    })
    if (linkError) {
      return { error: inviteError.message ?? linkError.message ?? 'Unable to send invite', inviteeUserId: null }
    }
    inviteeUserId = linkData?.user?.id ?? inviteeUserId
  }

  await adminClient
    .from('invites')
    .upsert(
      {
        inviter_user_id: inviterUserId,
        invitee_user_id: inviteeUserId,
        invitee_email: email,
        role,
        status: 'pending',
      },
      { onConflict: 'invitee_email' }
    )

  return { inviteeUserId, error: null }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const url = new URL(request.url)
  const origin = url.origin

  const { data: currentUser } = await supabase.auth.getUser()
  if (!currentUser.user) {
    return { error: 'Session unavailable' }
  }

  const formData = await request.formData()
  const role = formData.get('role') as 'guardian' | 'student'
  const pid = formData.get('pid') as string
  const formId = formData.get('form_id') as string
  if (!formId) {
    return { error: 'Form is missing' }
  }

  const { data: flowEntry } = await supabase
    .from('sign_up_flow')
    .select('slug')
    .eq('form_id', formId)
    .maybeSingle()
  const currentSlug = flowEntry?.slug ?? ''

  const { data: questionRows } = await supabase
    .from('form_question_map')
    .select(
      'question_code, prompt_override, options_override, metadata, visibility_condition, form_question ( prompt, type, options )'
    )
    .eq('form_id', formId)
    .order('position')

  const questions = (questionRows ?? []).map(row => {
    const base = Array.isArray(row.form_question) ? row.form_question[0] : row.form_question
    return {
      question_code: row.question_code ?? '',
      prompt: row.prompt_override ?? base?.prompt ?? '',
      type: (base?.type ?? 'text') as Database['public']['Enums']['form_question_type'],
      options: (row.options_override ?? base?.options ?? []) as Json,
      metadata: (row.metadata ?? {}) as Json,
      visibility_condition: (row.visibility_condition ?? null) as Json,
    } satisfies FormQuestionData
  })

  if (!questions.length) {
    return { error: 'Form is not configured' }
  }

  const { data: submissions } = await supabase
    .from('form_submission')
    .select('form_id, form_answer ( question_code, value )')
    .eq('profile_id', pid)
  const submissionData = buildAnswerMapFromSubmissions(submissions ?? [])

  const submittedAnswers: Record<string, Json> = {}
  for (const question of questions) {
    const value = parseFormValue(question, formData)
    if (value !== null) {
      submittedAnswers[question.question_code] = value
    }
  }

  const combinedAnswers = mergeAnswerMaps(submissionData.answers, submittedAnswers)
  const answersToSave: { questionCode: string; value: Json }[] = []
  const hiddenQuestionCodes: string[] = []

  for (const question of questions) {
    const isVisible = isConditionMet(question.visibility_condition as Json, combinedAnswers)
    if (!isVisible) {
      hiddenQuestionCodes.push(question.question_code)
      continue
    }

    const metadata = (question.metadata ?? {}) as Record<string, Json>
    const isOptional = metadata.optional === true
    const isRequired = !isOptional
    const value = submittedAnswers[question.question_code]

    if (question.type === 'checkbox' && isRequired) {
      if (value !== true) {
        return { error: `Please answer "${question.prompt}"` }
      }
    } else if (question.type === 'multi_choice' && isRequired) {
      if (!Array.isArray(value) || value.length === 0) {
        return { error: `Please answer "${question.prompt}"` }
      }
    } else if (isRequired) {
      if (value === undefined || value === null || value === '') {
        return { error: `Please answer "${question.prompt}"` }
      }
    }

    if (value !== undefined) {
      answersToSave.push({ questionCode: question.question_code, value })
    }
  }

  const { data: submission, error: submissionError } = await supabase
    .from('form_submission')
    .upsert(
      {
        form_id: formId,
        profile_id: pid,
      },
      { onConflict: 'form_id,profile_id' }
    )
    .select('id')
    .single()
  if (submissionError || !submission?.id) {
    console.error('form submission failed', submissionError?.message, { pid, formId })
    return { error: submissionError?.message ?? 'Unable to save responses' }
  }

  if (answersToSave.length) {
    const answerRows = answersToSave.map(answer => ({
      submission_id: submission.id,
      question_code: answer.questionCode,
      value: answer.value,
    }))
    const { error: answerError } = await supabase
      .from('form_answer')
      .upsert(answerRows, { onConflict: 'submission_id,question_code' })
    if (answerError) {
      console.error('form answers failed', answerError.message, { pid, formId })
      return { error: answerError.message ?? 'Unable to save responses' }
    }
  }

  if (hiddenQuestionCodes.length) {
    await supabase
      .from('form_answer')
      .delete()
      .in('question_code', hiddenQuestionCodes)
      .eq('submission_id', submission.id)
  }

  const { guardianPid, childPid } = await resolveRelationship(supabase, role, pid)
  const inviterEmail = currentUser.user.email ?? ''
  const inviterUserId = currentUser.user.id

  const profileUpdates: { guardian: Record<string, Json>; child: Record<string, Json> } = {
    guardian: {},
    child: {},
  }

  const additionalGuardian: Record<string, Json> = {}
  let guardianInviteEmail: string | null = null

  for (const question of questions) {
    const isVisible = isConditionMet(question.visibility_condition as Json, combinedAnswers)
    if (!isVisible) continue

    const metadata = (question.metadata ?? {}) as Record<string, Json>
    if (metadata.target === 'profile' && typeof metadata.field === 'string') {
      const targetRole =
        metadata.role === 'self'
          ? role === 'guardian'
            ? 'guardian'
            : 'child'
          : metadata.role === 'child'
            ? 'child'
            : 'guardian'
      const value = submittedAnswers[question.question_code]
      if (value !== undefined && value !== null && value !== '') {
        profileUpdates[targetRole][metadata.field] = value
      }
    }

    if (metadata.target === 'additional_guardian' && typeof metadata.field === 'string') {
      const value = submittedAnswers[question.question_code]
      if (value !== undefined && value !== null && value !== '') {
        additionalGuardian[metadata.field] = value
      }
    }

    if (metadata.action === 'invite_guardian') {
      const value = submittedAnswers[question.question_code]
      if (typeof value === 'string' && value.trim()) {
        guardianInviteEmail = value.trim()
      }
    }
  }

  let resolvedGuardianPid = guardianPid
  let resolvedChildPid = childPid

  if (!resolvedGuardianPid && Object.keys(profileUpdates.guardian).length > 0) {
    const guardianPayload = {
      role: 'guardian',
      ...profileUpdates.guardian,
    }
    const hasEmail = typeof guardianPayload.email === 'string' && guardianPayload.email.trim()
    const guardianResponse = hasEmail
      ? await adminClient
          .from('profile')
          .upsert(guardianPayload, { onConflict: 'email' })
          .select('id')
          .single()
      : await adminClient.from('profile').insert(guardianPayload).select('id').single()
    if (guardianResponse.error || !guardianResponse.data?.id) {
      return { error: guardianResponse.error?.message ?? 'Unable to save guardian information' }
    }
    resolvedGuardianPid = guardianResponse.data.id
  }

  if (!resolvedChildPid && Object.keys(profileUpdates.child).length > 0) {
    const childPayload = {
      role: 'student',
      ...profileUpdates.child,
    }
    const { data: childRow, error: childError } = await adminClient
      .from('profile')
      .insert(childPayload)
      .select('id')
      .single()
    if (childError || !childRow?.id) {
      return { error: childError?.message ?? 'Unable to save child information' }
    }
    resolvedChildPid = childRow.id
  }

  if (resolvedGuardianPid && resolvedChildPid) {
    await ensureGuardianChildLink(resolvedGuardianPid, resolvedChildPid, true)
  }

  const updateProfile = async (targetPid: string, updates: Record<string, Json>) => {
    const client = targetPid === pid ? supabase : adminClient
    await client.from('profile').update(updates).eq('id', targetPid)
  }

  if (resolvedGuardianPid && Object.keys(profileUpdates.guardian).length > 0) {
    await updateProfile(resolvedGuardianPid, profileUpdates.guardian)
  }

  if (resolvedChildPid && Object.keys(profileUpdates.child).length > 0) {
    await updateProfile(resolvedChildPid, profileUpdates.child)
  }

  if (currentSlug === 'guardian_details' && role === 'student') {
    if (!guardianInviteEmail) {
      return { error: 'Guardian email is required' }
    }

    const { inviteeUserId, error: inviteError } = await sendInvite({
      email: guardianInviteEmail,
      role: 'guardian',
      origin,
      inviterPid: pid,
      inviterRole: 'student',
      inviterEmail,
      inviterUserId,
    })
    if (inviteError) {
      return { error: inviteError }
    }

    if (resolvedGuardianPid && inviteeUserId) {
      await adminClient
        .from('profile')
        .update({ user_id: inviteeUserId })
        .eq('id', resolvedGuardianPid)
    }
  }

  if (currentSlug === 'child_email' && role === 'guardian') {
    const childHasEmail = normalizeString(combinedAnswers.child_has_email) === 'Yes'
    const childEmail = normalizeString(combinedAnswers.child_email)

    if (childHasEmail && childEmail) {
      if (role === 'guardian' && resolvedGuardianPid) {
        const { inviteeUserId, error: inviteError } = await sendInvite({
          email: childEmail,
          role: 'student',
          origin,
          inviterPid: resolvedGuardianPid,
          inviterRole: 'guardian',
          inviterEmail,
          inviterUserId,
        })
        if (inviteError) {
          return { error: inviteError }
        }

        if (resolvedChildPid) {
          await adminClient
            .from('profile')
            .update({
              email: childEmail,
              ...(inviteeUserId ? { user_id: inviteeUserId } : {}),
            })
            .eq('id', resolvedChildPid)
          await ensureGuardianChildLink(resolvedGuardianPid, resolvedChildPid, true)
        } else {
          const inviteeProfilePayload = {
            email: childEmail,
            role: 'student',
            ...(inviteeUserId ? { user_id: inviteeUserId } : {}),
          }
          const { data: inviteeRow, error: inviteeError } = await adminClient
            .from('profile')
            .upsert(inviteeProfilePayload, { onConflict: 'email' })
            .select('id')
            .single()
          if (inviteeError || !inviteeRow?.id) {
            return { error: inviteeError?.message ?? 'Unable to prepare child invite' }
          }

          await ensureGuardianChildLink(resolvedGuardianPid, inviteeRow.id, true)
        }
      }

      if (role === 'student' && resolvedChildPid) {
        await supabase.from('profile').update({ email: childEmail }).eq('id', resolvedChildPid)
      }
    }
  }

  if (currentSlug === 'additional_guardians') {
    const guardianFirstname = normalizeString(additionalGuardian.firstname)
    const guardianSurname = normalizeString(additionalGuardian.surname)
    const guardianEmail = normalizeString(additionalGuardian.email)

    if ((guardianFirstname || guardianSurname || guardianEmail) && resolvedChildPid) {
      let additionalGuardianPid: string | null = null
      let inviteeUserId: string | null = null

      if (guardianEmail) {
        const inviteResult = await sendInvite({
          email: guardianEmail,
          role: 'guardian',
          origin,
          inviterPid: pid,
          inviterRole: role,
          inviterEmail,
          inviterUserId,
        })
        if (inviteResult.error) {
          return { error: inviteResult.error }
        }
        inviteeUserId = inviteResult.inviteeUserId

        const { data: guardianRow, error: guardianError } = await adminClient
          .from('profile')
          .upsert(
            {
              email: guardianEmail,
              role: 'guardian',
              firstname: guardianFirstname || null,
              surname: guardianSurname || null,
              ...(inviteeUserId ? { user_id: inviteeUserId } : {}),
            },
            { onConflict: 'email' }
          )
          .select('id')
          .single()
        if (guardianError || !guardianRow?.id) {
          return { error: guardianError?.message ?? 'Unable to save additional guardian' }
        }
        additionalGuardianPid = guardianRow.id
      } else {
        const { data: guardianRow, error: guardianError } = await adminClient
          .from('profile')
          .insert({
            role: 'guardian',
            firstname: guardianFirstname || null,
            surname: guardianSurname || null,
          })
          .select('id')
          .single()
        if (guardianError || !guardianRow?.id) {
          return { error: guardianError?.message ?? 'Unable to save additional guardian' }
        }
        additionalGuardianPid = guardianRow.id
      }

      if (additionalGuardianPid) {
        await ensureGuardianChildLink(additionalGuardianPid, resolvedChildPid, false)
      }
    }
  }

  return redirect(`/auth/sign-up-details?role=${role}&pid=${pid}&form_id=${formId}`, { headers })
}

export default function SignUpDetails() {
  const fetcher = useFetcher<typeof action>()
  const data = useLoaderData() as LoaderData
  const {
    role,
    pid,
    formSteps,
    currentForm,
    currentFormQuestions,
    currentFormAnswers,
    allAnswers,
    currentFormIndex,
    totalFormSteps,
    guardianStatus,
    waitingOnGuardians,
  } = data

  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'

  const [answerState, setAnswerState] = useState<Record<string, Json>>(
    mergeAnswerMaps(allAnswers, currentFormAnswers)
  )

  useEffect(() => {
    setAnswerState(mergeAnswerMaps(allAnswers, currentFormAnswers))
  }, [allAnswers, currentFormAnswers, currentForm?.formId])

  const questionTypeMap = useMemo(() => {
    return currentFormQuestions.reduce<Record<string, Database['public']['Enums']['form_question_type']>>(
      (acc, question) => {
        acc[question.question_code] = question.type
        return acc
      },
      {}
    )
  }, [currentFormQuestions])

  const handleChange: FormEventHandler<HTMLFormElement> = event => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    if (!target?.name?.startsWith('question_')) return
    const questionCode = target.name.replace('question_', '')
    const questionType = questionTypeMap[questionCode]

    setAnswerState(current => {
      const next = { ...current }
      if (questionType === 'multi_choice') {
        const existing = Array.isArray(next[questionCode]) ? [...(next[questionCode] as string[])] : []
        if (target instanceof HTMLInputElement && target.type === 'checkbox') {
          if (target.checked) {
            if (!existing.includes(target.value)) {
              existing.push(target.value)
            }
          } else {
            const index = existing.indexOf(target.value)
            if (index >= 0) existing.splice(index, 1)
          }
          next[questionCode] = existing
        }
        return next
      }

      if (questionType === 'checkbox') {
        next[questionCode] = target instanceof HTMLInputElement ? target.checked : Boolean(target.value)
        return next
      }

      next[questionCode] = target.value
      return next
    })
  }

  const visibleQuestions = currentFormQuestions.filter(question =>
    isConditionMet(question.visibility_condition as Json, answerState)
  )

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{currentForm?.name ?? 'Sign-up details'}</CardTitle>
            <CardDescription>Complete each step to finish your registration.</CardDescription>
          </CardHeader>
          <CardContent>
            {formSteps.length > 0 && (
              <div className="mb-4 space-y-2 text-sm text-slate-500">
                {formSteps.map((form, index) => (
                  <div key={form.formId} className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">
                      {index + 1}. {form.name}
                    </span>
                    <span
                      className={`text-xs uppercase tracking-wide ${
                        form.status === 'submitted' ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      {form.status === 'submitted' ? 'Complete' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {currentForm ? (
              <fetcher.Form method="post" className="flex flex-col gap-6" onChange={handleChange}>
                <input type="hidden" name="role" value={role} />
                <input type="hidden" name="pid" value={pid} />
                <input type="hidden" name="form_id" value={currentForm.formId} />
                <p className="text-sm text-slate-500">
                  Step {currentFormIndex ?? 1} of {totalFormSteps}
                </p>
                {visibleQuestions.map(question => {
                  const metadata = (question.metadata ?? {}) as Record<string, Json>
                  const isOptional = metadata.optional === true
                  return (
                    <FormQuestion
                      key={question.question_code}
                      question={question}
                      value={currentFormAnswers[question.question_code]}
                      required={!isOptional}
                    />
                  )
                })}
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Saving...' : 'Save and continue'}
                </Button>
              </fetcher.Form>
            ) : (
              <div className="space-y-4">
                {waitingOnGuardians ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-700">
                      Your sign-up details are complete. We still need at least one guardian to finish
                      their sign-up details and consent.
                    </p>
                    {guardianStatus && guardianStatus.length > 0 ? (
                      <div className="rounded-md border border-slate-200">
                        {guardianStatus.map(guardian => (
                          <div
                            key={guardian.id}
                            className="flex items-center justify-between border-b border-slate-200 px-4 py-3 last:border-b-0"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {[guardian.firstname, guardian.surname].filter(Boolean).join(' ') ||
                                  guardian.email ||
                                  'Guardian'}
                              </p>
                              {guardian.email && (
                                <p className="text-xs text-slate-500">{guardian.email}</p>
                              )}
                            </div>
                            <span
                              className={`text-xs uppercase tracking-wide ${
                                guardian.isComplete ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                            >
                              {guardian.isComplete ? 'Complete' : 'Pending'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        No guardians are linked yet. Please invite a guardian to continue.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No required steps right now.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
