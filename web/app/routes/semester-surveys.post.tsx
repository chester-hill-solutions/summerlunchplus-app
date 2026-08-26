import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from 'react-router'

import AuthStickerBackground from '@/components/auth/sticker-background'
import FormQuestion, { type FormQuestionData } from '@/components/forms/form-question'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { enforceOnboardingGuard } from '@/lib/auth.server'
import type { Json } from '@/lib/database.types'
import { loadPostProgramSurveyCampaignForCurrentProfile } from '@/lib/post-program-survey/campaign.server'
import { completePostProgramSurveyCampaign } from '@/lib/post-program-survey/submission.server'
import { extractRequestMetadata } from '@/lib/request-metadata.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/semester-surveys.post'

type LoaderData = {
  campaignId: string
  completed: boolean
  formName: string
  questions: FormQuestionData[]
}

type ActionData = {
  error?: string
}

const parseFormValue = (question: FormQuestionData, formData: FormData): Json | null => {
  const fieldName = `question_${question.question_code}`

  if (question.type === 'multi_choice') {
    const choices = formData
      .getAll(fieldName)
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean)
    return choices.length ? choices : null
  }

  if (question.type === 'checkbox') return formData.has(fieldName)
  if (question.type === 'no-input-text') return null

  const rawValue = (formData.get(fieldName) as string | null)?.trim() ?? ''
  return rawValue || null
}

const loadQuestions = async (formId: string): Promise<FormQuestionData[]> => {
  const { data: questions, error } = await adminClient
    .from('form_question_map')
    .select('question_code, prompt_override, options_override, metadata, form_question ( prompt, type, options )')
    .eq('form_id', formId)
    .order('position')

  if (error) throw new Error(error.message)
  return (questions ?? []).map(row => {
    const base = Array.isArray(row.form_question) ? row.form_question[0] : row.form_question
    return {
      question_code: row.question_code ?? '',
      prompt: row.prompt_override ?? base?.prompt ?? '',
      type: (base?.type ?? 'text') as FormQuestionData['type'],
      options: (row.options_override ?? base?.options ?? []) as Json,
      metadata: (row.metadata ?? {}) as Json,
    }
  })
}

const loadCampaignForRequest = async (request: Request, semesterId: string) => {
  const auth = await enforceOnboardingGuard(request)
  const { supabase, headers: supabaseHeaders } = createClient(request)
  const headers = new Headers(auth.headers)
  supabaseHeaders.forEach((value, key) => headers.append(key, value))
  const campaign = await loadPostProgramSurveyCampaignForCurrentProfile(supabase, semesterId)
  if (!campaign || new Date(campaign.available_at).getTime() > Date.now()) {
    throw redirect('/home', { headers })
  }
  return { auth, supabase, headers, campaign }
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const semesterId = params.semesterId
  if (!semesterId) throw redirect('/home')

  const { headers, campaign } = await loadCampaignForRequest(request, semesterId)
  const { data: form, error } = await adminClient
    .from('form')
    .select('id, name')
    .eq('id', campaign.form_id)
    .maybeSingle()

  if (error || !form?.id) throw redirect('/home', { headers })

  return {
    campaignId: campaign.id,
    completed: campaign.completed_at !== null,
    formName: form.name,
    questions: campaign.completed_at ? [] : await loadQuestions(form.id),
  } satisfies LoaderData
}

export async function action({ request, params }: Route.ActionArgs) {
  const semesterId = params.semesterId
  if (!semesterId) return { error: 'Semester is missing.' } satisfies ActionData

  const { supabase, headers, campaign } = await loadCampaignForRequest(request, semesterId)
  if (campaign.completed_at) throw redirect('/home', { headers })

  const questions = await loadQuestions(campaign.form_id)
  const formData = await request.formData()
  const answers: Record<string, Json> = {}

  for (const question of questions) {
    const metadata = (question.metadata ?? {}) as Record<string, Json>
    const value = parseFormValue(question, formData)
    const required = metadata.optional !== true && question.type !== 'no-input-text'

    if (
      required &&
      (value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0))
    ) {
      return { error: `Please answer "${question.prompt}".` } satisfies ActionData
    }

    if (value !== null) answers[question.question_code] = value
  }

  try {
    await completePostProgramSurveyCampaign({
      supabase,
      campaignId: campaign.id,
      answers,
      requestMetadata: JSON.parse(JSON.stringify(extractRequestMetadata(request))) as Json,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to save the survey.' } satisfies ActionData
  }

  throw redirect(`/semester-surveys/${semesterId}/post-program`, { headers })
}

export default function SemesterPostSurveyPage() {
  const { completed, formName, questions } = useLoaderData() as LoaderData
  const actionData = useActionData() as ActionData | undefined
  const navigation = useNavigation()

  return (
    <AuthStickerBackground maxWidthClassName="max-w-3xl" dense scrollContent>
      <div className="w-full py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{formName}</CardTitle>
            <CardDescription>
              {completed
                ? 'Thank you. Your family has completed this post-program survey.'
                : 'Please share your family’s experience with summerlunch+.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {completed ? (
              <Button asChild>
                <Link to="/home">Return home</Link>
              </Button>
            ) : (
              <Form method="post" className="space-y-6">
                {questions.map(question => {
                  const metadata = (question.metadata ?? {}) as Record<string, Json>
                  return (
                    <FormQuestion
                      key={question.question_code}
                      question={question}
                      required={metadata.optional !== true && question.type !== 'no-input-text'}
                    />
                  )
                })}

                {actionData?.error ? <p className="text-sm text-destructive">{actionData.error}</p> : null}

                <div className="flex items-center justify-end gap-3">
                  <Button variant="ghost" asChild>
                    <Link to="/home">Cancel</Link>
                  </Button>
                  <Button type="submit" disabled={navigation.state !== 'idle'}>
                    {navigation.state === 'idle' ? 'Submit survey' : 'Submitting survey...'}
                  </Button>
                </div>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </AuthStickerBackground>
  )
}
