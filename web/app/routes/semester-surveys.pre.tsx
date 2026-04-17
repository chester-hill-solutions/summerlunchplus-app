import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import FormQuestion, { type FormQuestionData } from '@/components/forms/form-question'
import { enforceOnboardingGuard } from '@/lib/auth.server'
import { resolveFamilyGraph } from '@/lib/family.server'
import { extractRequestMetadata } from '@/lib/request-metadata.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'

import type { Route } from './+types/semester-surveys.pre'

type LoaderData = {
  semesterId: string
  formId: string
  formName: string
  questions: FormQuestionData[]
  answers: Record<string, Json>
  familyProfileId: string
}

type ActionData = {
  error?: string
}

const getPreSurveyFormName = (semesterId: string) => `Pre-Semester Survey - ${semesterId}`

const parseFormValue = (question: FormQuestionData, formData: FormData) => {
  const fieldName = `question_${question.question_code}`

  if (question.type === 'multi_choice') {
    const choices = formData
      .getAll(fieldName)
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean)
    return choices.length ? choices : null
  }

  if (question.type === 'checkbox') {
    return formData.has(fieldName)
  }

  const rawValue = (formData.get(fieldName) as string | null)?.trim() ?? ''
  if (!rawValue) return null
  return rawValue
}

const getFamilyEnrollmentProfileId = (family: Awaited<ReturnType<typeof resolveFamilyGraph>>) => {
  if (family.profileRole === 'guardian') {
    return family.primaryChildByGuardian.get(family.profileId) ?? null
  }
  return family.profileId
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const semesterId = params.semesterId
  if (!semesterId) {
    throw redirect('/home')
  }

  const auth = await enforceOnboardingGuard(request)
  const { supabase, headers } = createClient(request)
  const family = await resolveFamilyGraph(supabase, auth.user.id)
  const familyProfileId = getFamilyEnrollmentProfileId(family)

  if (!familyProfileId) {
    throw redirect('/home', { headers })
  }

  const formName = getPreSurveyFormName(semesterId)
  const { data: formRow } = await adminClient
    .from('form')
    .select('id, name')
    .eq('name', formName)
    .maybeSingle()

  if (!formRow?.id) {
    throw redirect('/home', { headers })
  }

  const { data: questions } = await adminClient
    .from('form_question_map')
    .select(
      'question_code, prompt_override, options_override, metadata, form_question ( prompt, type, options )'
    )
    .eq('form_id', formRow.id)
    .order('position')

  const normalizedQuestions: FormQuestionData[] = (questions ?? []).map(row => {
    const base = Array.isArray(row.form_question) ? row.form_question[0] : row.form_question
    return {
      question_code: row.question_code ?? '',
      prompt: row.prompt_override ?? base?.prompt ?? '',
      type: (base?.type ?? 'text') as FormQuestionData['type'],
      options: (row.options_override ?? base?.options ?? []) as Json,
      metadata: (row.metadata ?? {}) as Json,
    }
  })

  const { data: submission } = await adminClient
    .from('form_submission')
    .select('id')
    .eq('form_id', formRow.id)
    .eq('profile_id', familyProfileId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let answers: Record<string, Json> = {}
  if (submission?.id) {
    const { data: answerRows } = await adminClient
      .from('form_answer')
      .select('question_code, value')
      .eq('submission_id', submission.id)
    answers = Object.fromEntries(
      (answerRows ?? [])
        .filter(row => Boolean(row.question_code))
        .map(row => [String(row.question_code), row.value as Json])
    )
  }

  return {
    semesterId,
    formId: formRow.id,
    formName: formRow.name,
    questions: normalizedQuestions,
    answers,
    familyProfileId,
  } satisfies LoaderData
}

export async function action({ request, params }: Route.ActionArgs) {
  const semesterId = params.semesterId
  if (!semesterId) {
    return { error: 'Semester is missing' } satisfies ActionData
  }

  const auth = await enforceOnboardingGuard(request)
  const { supabase, headers } = createClient(request)
  const family = await resolveFamilyGraph(supabase, auth.user.id)
  const familyProfileId = getFamilyEnrollmentProfileId(family)
  if (!familyProfileId) {
    return { error: 'Family enrollment profile is missing' } satisfies ActionData
  }

  const formName = getPreSurveyFormName(semesterId)
  const { data: formRow } = await adminClient
    .from('form')
    .select('id')
    .eq('name', formName)
    .maybeSingle()

  if (!formRow?.id) {
    return { error: 'Pre-semester survey is not configured' } satisfies ActionData
  }

  const { data: questionRows } = await adminClient
    .from('form_question_map')
    .select('question_code, metadata, form_question ( prompt, type )')
    .eq('form_id', formRow.id)
    .order('position')

  const questions = (questionRows ?? []).map(row => {
    const base = Array.isArray(row.form_question) ? row.form_question[0] : row.form_question
    return {
      question_code: row.question_code ?? '',
      prompt: base?.prompt ?? '',
      type: (base?.type ?? 'text') as FormQuestionData['type'],
      metadata: (row.metadata ?? {}) as Record<string, Json>,
    }
  })

  const formData = await request.formData()
  const answersToSave: { question_code: string; value: Json }[] = []

  for (const question of questions) {
    const value = parseFormValue(
      {
        question_code: question.question_code,
        prompt: question.prompt,
        type: question.type,
        options: [],
        metadata: question.metadata as Json,
      },
      formData
    )

    const isOptional = question.metadata.optional === true
    const isRequired = !isOptional

    if (question.type === 'checkbox' && isRequired) {
      if (value !== true) {
        return { error: `Please answer "${question.prompt}"` } satisfies ActionData
      }
    } else if (question.type === 'multi_choice' && isRequired) {
      if (!Array.isArray(value) || value.length === 0) {
        return { error: `Please answer "${question.prompt}"` } satisfies ActionData
      }
    } else if (isRequired) {
      if (value === null || value === '') {
        return { error: `Please answer "${question.prompt}"` } satisfies ActionData
      }
    }

    if (value !== null) {
      answersToSave.push({ question_code: question.question_code, value })
    }
  }

  const requestMetadata = extractRequestMetadata(request)
  const { data: submission, error: submissionError } = await adminClient
    .from('form_submission')
    .insert({
      form_id: formRow.id,
      profile_id: familyProfileId,
      user_id: auth.user.id,
      ip_address: requestMetadata.ipAddress,
      forwarded_for: requestMetadata.forwardedFor,
      user_agent: requestMetadata.userAgent,
      accept_language: requestMetadata.acceptLanguage,
      referer: requestMetadata.referer,
      origin: requestMetadata.origin,
      metadata: { source: 'semester_pre_survey' },
    })
    .select('id')
    .single()

  if (submissionError || !submission?.id) {
    return { error: submissionError?.message ?? 'Unable to save survey' } satisfies ActionData
  }

  if (answersToSave.length > 0) {
    const payload = answersToSave.map(answer => ({
      submission_id: submission.id,
      question_code: answer.question_code,
      value: answer.value,
    }))
    const { error: answerError } = await adminClient
      .from('form_answer')
      .upsert(payload, { onConflict: 'submission_id,question_code' })

    if (answerError) {
      return { error: answerError.message } satisfies ActionData
    }
  }

  throw redirect('/home', { headers })
}

export default function SemesterPreSurveyPage() {
  const { semesterId, formName, formId, questions, answers } = useLoaderData() as LoaderData
  const actionData = useActionData() as ActionData | undefined
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{formName}</CardTitle>
          <CardDescription>
            Complete this family survey before enrolling in classes for this semester.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-6">
            <p className="text-sm text-slate-500">Semester: {semesterId}</p>

            {questions.map(question => {
              const metadata = (question.metadata ?? {}) as Record<string, Json>
              const isOptional = metadata.optional === true
              return (
                <FormQuestion
                  key={question.question_code}
                  question={question}
                  value={answers[question.question_code]}
                  required={!isOptional}
                />
              )
            })}

            {actionData?.error ? <p className="text-sm text-red-500">{actionData.error}</p> : null}

            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" asChild>
                <Link to="/home">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save and continue'}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-slate-500">Form ID: {formId}</p>
    </main>
  )
}
