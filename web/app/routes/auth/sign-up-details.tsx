import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/adminClient'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import FormQuestion, { type FormQuestionData } from '@/components/forms/form-question'
import type { Database, Json } from '@/lib/database.types'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { redirect, useFetcher, useLoaderData } from 'react-router'
import { useState } from 'react'

type FormStep = {
  formId: string
  name: string
  slug: string
  position: number
  status: Database['public']['Enums']['form_assignment_status']
}

type LoaderStep = 'details' | 'forms' | 'invite'

type LoaderData = {
  role: 'parent' | 'student' | null
  pid: string
  step: LoaderStep
  firstname: string | null
  surname: string | null
  phone: string | null
  postcode: string | null
  inviterPid: string | null
  inviterRole: 'parent' | 'student' | null
  hasRelationship: boolean
  formSteps: FormStep[]
  currentForm: FormStep | null
  currentFormQuestions: FormQuestionData[]
  currentFormAnswers: Record<string, Json>
  currentFormIndex: number | null
  totalFormSteps: number
  formsComplete: boolean
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw redirect('/auth/sign-up', { headers })

  const url = new URL(request.url)
  const requestedStep = (url.searchParams.get('step') as LoaderStep) || 'details'
  const requestedFormId = url.searchParams.get('form_id')
  const roleParam = url.searchParams.get('role') as 'parent' | 'student' | null
  const pidParam = url.searchParams.get('pid')

  let pid = pidParam
  if (!pid) {
    const { data: personCandidate } = await supabase
      .from('person')
      .select('id')
      .eq('user_id', userData.user.id)
      .single()
    if (!personCandidate?.id) throw redirect('/auth/sign-up', { headers })
    pid = personCandidate.id
  }
  if (!pid) throw redirect('/auth/sign-up', { headers })

  const { data: person } = await supabase
    .from('person')
    .select('firstname, surname, phone, postcode, role')
    .eq('id', pid)
    .single()
  if (!person) throw redirect('/auth/sign-up', { headers })

  const resolvedRole = (roleParam ?? (person.role as 'parent' | 'student') ?? 'student') as 'parent' | 'student'
  const detailsComplete = Boolean(person.firstname && person.surname && person.phone && person.postcode)

  const { data: relationship } = await supabase
    .from('person_parent')
    .select('id')
    .or(`person_id.eq.${pid},parent_id.eq.${pid}`)
    .limit(1)
    .maybeSingle()
  const hasRelationship = Boolean(relationship?.id)
  const inviteEnabled = !hasRelationship

  const { data: flowEntries } = await supabase
    .from('sign_up_flow')
    .select('slug, step_order, roles, form_id, form ( id, name )')
    .order('step_order')
  const normalizedFlowEntries = (flowEntries ?? []).map(entry => ({
    ...entry,
    form: Array.isArray(entry.form) ? entry.form[0] ?? null : entry.form,
  }))
  const relevantForms = normalizedFlowEntries.filter(entry => entry.roles?.includes(resolvedRole))
  const formIds = relevantForms.map(entry => entry.form_id)

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

  const formSteps: FormStep[] = relevantForms.map(entry => ({
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
  const currentFormAnswers: Record<string, Json> = {}
  if (currentForm) {
    const { data: questions } = await supabase
      .from('form_question')
      .select('question_code, prompt, type, position, options')
      .eq('form_id', currentForm.formId)
      .order('position')
    currentFormQuestions = (questions ?? []).map(q => ({
      question_code: q.question_code ?? '',
      prompt: q.prompt,
      type: q.type as Database['public']['Enums']['form_question_type'],
      options: q.options,
    }))
    const { data: submission } = await supabase
      .from('form_submission')
      .select('id')
      .eq('form_id', currentForm.formId)
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (submission?.id) {
      const { data: answers } = await supabase
        .from('form_answer')
        .select('question_code, value')
        .eq('submission_id', submission.id)
      for (const answer of answers ?? []) {
        currentFormAnswers[answer.question_code] = answer.value
      }
    }
  }

  const formsComplete = formSteps.length === 0 || formSteps.every(step => step.status === 'submitted')

  if (formsComplete && detailsComplete && inviteEnabled && requestedStep !== 'invite') {
    const nextUrl = new URL(request.url)
    nextUrl.searchParams.set('step', 'invite')
    nextUrl.searchParams.delete('form_id')
    return redirect(nextUrl.toString(), { headers })
  }

  if (formsComplete && detailsComplete && !inviteEnabled) {
    return redirect('/home', { headers })
  }

  let effectiveStep: LoaderStep = requestedStep
  if (effectiveStep === 'forms' && !detailsComplete) {
    effectiveStep = 'details'
  }
  if (effectiveStep === 'forms' && (!formSteps.length || formsComplete)) {
    effectiveStep = inviteEnabled ? 'invite' : 'details'
  }
  if (effectiveStep === 'invite' && !detailsComplete) {
    effectiveStep = 'details'
  }
  if (effectiveStep === 'invite' && !inviteEnabled) {
    effectiveStep = 'details'
  }
  if (effectiveStep === 'forms' && currentForm == null && formSteps.length > 0) {
    effectiveStep = detailsComplete ? (inviteEnabled ? 'invite' : 'details') : 'details'
  }

  return {
    role: resolvedRole,
    pid,
    step: effectiveStep,
    firstname: person.firstname,
    surname: person.surname,
    phone: person.phone,
    postcode: person.postcode,
    inviterPid: url.searchParams.get('inviter_pid'),
    inviterRole: (url.searchParams.get('inviter_role') as 'parent' | 'student') ?? null,
    hasRelationship,
    formSteps,
    currentForm,
    currentFormQuestions,
    currentFormAnswers,
    currentFormIndex,
    totalFormSteps: formSteps.length,
    formsComplete,
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const url = new URL(request.url)
  const origin = url.origin

  const formData = await request.formData()
  const role = formData.get('role') as 'parent' | 'student'
  const pid = formData.get('pid') as string
  const step = (formData.get('step') as LoaderStep) ?? 'details'
  const firstname = (formData.get('firstname') as string)?.trim()
  const surname = (formData.get('surname') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim()
  const postcode = (formData.get('postcode') as string)?.trim()
  const dateOfBirth = (formData.get('date_of_birth') as string)?.trim()
  const inviteEmail = (formData.get('invite-email') as string)?.trim()
  const postalRe = /^[A-Z]\d[A-Z] \d[A-Z]\d$/
  const { data: currentUser } = await supabase.auth.getUser()
  const inviterEmail = currentUser?.user?.email ?? ''

  if (step === 'forms') {
    const formId = formData.get('form_id') as string
    if (!formId) {
      return { error: 'Form is missing' }
    }

    const { data: form } = await supabase
      .from('form')
      .select('id, form_question (question_code, prompt, type, options)')
      .eq('id', formId)
      .single()
    if (!form) {
      return { error: 'Form not found' }
    }

    const questions = form.form_question ?? []
    if (!questions.length) {
      return { error: 'Form is not configured' }
    }

    const userId = currentUser?.user?.id
    if (!userId) {
      return { error: 'Unable to identify user' }
    }

    const answers: { questionCode: string; value: Json }[] = []
    for (const question of questions) {
      const fieldName = `question_${question.question_code}`
      if (question.type === 'multi_choice') {
        const choices = formData
          .getAll(fieldName)
          .filter((value): value is string => typeof value === 'string')
        if (!choices.length) {
          return { error: `Please answer "${question.prompt}"` }
        }
        answers.push({ questionCode: question.question_code, value: choices })
        continue
      }

      if (question.type === 'checkbox') {
        const checked = formData.has(fieldName)
        answers.push({ questionCode: question.question_code, value: checked })
        continue
      }

      const rawValue = (formData.get(fieldName) as string | null)?.trim() ?? ''
      if (!rawValue) {
        return { error: `Please answer "${question.prompt}"` }
      }
      answers.push({ questionCode: question.question_code, value: rawValue })
    }

    const { data: submission, error: submissionError } = await supabase
      .from('form_submission')
      .upsert(
        {
          form_id: formId,
          user_id: userId,
        },
        { onConflict: 'form_id,user_id' }
      )
      .select('id')
      .single()
    if (submissionError || !submission?.id) {
      console.error('form submission failed', submissionError?.message, { pid, formId })
      return { error: submissionError?.message ?? 'Unable to save responses' }
    }

    const answerRows = answers.map(answer => ({
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

    return redirect(`/auth/sign-up-details?role=${role}&pid=${pid}&step=forms`, { headers })
  }

  if (step === 'details') {
    if (!firstname || !surname || !phone || !postcode) {
      return { error: 'All fields are required' }
    }
    if (!postalRe.test(postcode)) {
      return { error: 'Postal code must match A1A 1A1 format' }
    }

    const userId = currentUser?.user?.id
    console.log('sign-up-details action start', { pid, userId })
    if (!userId) {
      return { error: 'Unable to identify user' }
    }

    const personPayload: Record<string, unknown> = {
      id: pid,
      user_id: userId,
      firstname,
      surname,
      phone,
      postcode,
      email: inviterEmail,
    }

    if (role === 'student') {
      personPayload.date_of_birth = dateOfBirth || null
    }

    const { data: updatedPerson, error: updateError } = await supabase
      .from('person')
      .update(personPayload)
      .eq('id', pid)
      .select('id')
      .single()
    if (updateError) {
      console.error('person update failed', updateError.message, { pid, personPayload })
    }

    if (!updatedPerson?.id) {
      const { data: insertedPerson, error: insertError } = await supabase
        .from('person')
        .insert(personPayload)
        .select('id')
        .single()
      if (insertError) {
        console.error('person insert fallback failed', insertError.message, { pid, personPayload })
      }
      if (insertError || !insertedPerson?.id) {
        return { error: insertError?.message ?? 'Unable to save profile' }
      }
    }

    return redirect(`/auth/sign-up-details?role=${role}&pid=${pid}&step=forms`, { headers })
  }

  if (step === 'invite') {
    if (!inviteEmail) {
      return { error: 'Invite email is required' }
    }

    const targetRole = role === 'student' ? 'parent' : 'student'
    const redirectTo = `${origin}/auth/sign-up-details?role=${targetRole}`
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(inviteEmail, {
      redirectTo,
      data: {
        inviter_pid: pid,
        inviter_role: role,
        inviter_email: inviterEmail,
        role: targetRole,
      },
    })
    if (inviteError || !inviteData?.user?.id) {
      return { error: inviteError?.message ?? 'Unable to send invite' }
    }

    const inviteeUserId = inviteData.user.id
    const { data: inviteeRow, error: inviteeError } = await supabase
      .from('person')
      .upsert(
        {
          user_id: inviteeUserId,
          email: inviteEmail,
          role: targetRole,
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single()
    if (inviteeError || !inviteeRow?.id) {
      return { error: inviteeError?.message ?? 'Unable to prepare invitee profile' }
    }
    const inviteePid = inviteeRow.id

    const childId = role === 'parent' ? inviteePid : pid
    const parentId = role === 'parent' ? pid : inviteePid
    await supabase
      .from('person_parent')
      .upsert(
        { person_id: childId, parent_id: parentId },
        { onConflict: 'person_id,parent_id' }
      )

    const inviterId = currentUser?.user?.id ?? null
    if (inviterId) {
      await supabase
        .from('invites')
        .upsert(
          {
            inviter_user_id: inviterId,
            invitee_email: inviteEmail,
            role: targetRole,
            status: 'pending',
          },
          { onConflict: 'invitee_email' }
        )
    }

    return redirect('/home', { headers })
  }
}

export default function SignUpDetails() {
  const fetcher = useFetcher<typeof action>()
  const data = useLoaderData() as LoaderData
  const {
    role,
    pid,
    step,
    firstname,
    surname,
    phone,
    postcode: loaderPostcode,
    formSteps,
    currentForm,
    currentFormQuestions,
    currentFormAnswers,
    currentFormIndex,
    totalFormSteps,
  } = data
  const [postcode, setPostcode] = useState(loaderPostcode ?? '')
  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'
  const inviteLabel = role === 'student' ? "Parent's email" : "Student's email"

  const formatPC = (val: string) => {
    const raw = val.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (raw.length <= 3) return raw
    return raw.slice(0, 3) + ' ' + raw.slice(3, 6)
  }

  const stageTitles: Record<LoaderStep, string> = {
    details: 'Complete your profile',
    forms: currentForm?.name ?? 'Required form',
    invite: 'Invite a Parent/Student',
  }

  const stageDescriptions: Record<LoaderStep, string> = {
    details: 'One more step before you can continue',
    forms: 'Share the requested information to finish your sign-up',
    invite: 'Send an invite to your counterpart',
  }

  const formSummary = formSteps.length

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{stageTitles[step]}</CardTitle>
            <CardDescription>{stageDescriptions[step]}</CardDescription>
          </CardHeader>
          <CardContent>
            {formSummary > 0 && (
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
            {step === 'details' ? (
              <fetcher.Form method="post" className="flex flex-col gap-6">
                <input type="hidden" name="role" value={role ?? 'student'} />
                <input type="hidden" name="pid" value={pid} />
                <input type="hidden" name="step" value="details" />
                <div className="grid gap-2">
                  <Label htmlFor="firstname">First name</Label>
                  <Input id="firstname" name="firstname" defaultValue={firstname ?? ''} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="surname">Surname</Label>
                  <Input id="surname" name="surname" defaultValue={surname ?? ''} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" defaultValue={phone ?? ''} required />
                </div>
                {role === 'student' && (
                  <div className="grid gap-2">
                    <Label htmlFor="date_of_birth">Date of birth</Label>
                    <Input id="date_of_birth" name="date_of_birth" type="date" required />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="postcode">Postal Code</Label>
                  <Input
                    id="postcode"
                    name="postcode"
                    value={postcode}
                    onChange={e => setPostcode(formatPC(e.target.value))}
                    placeholder="A1A 1A1"
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Saving...' : 'Next'}
                </Button>
              </fetcher.Form>
            ) : step === 'forms' && currentForm ? (
              <fetcher.Form method="post" className="flex flex-col gap-6">
                <input type="hidden" name="role" value={role ?? 'student'} />
                <input type="hidden" name="pid" value={pid} />
                <input type="hidden" name="step" value="forms" />
                <input type="hidden" name="form_id" value={currentForm.formId} />
                <p className="text-sm text-slate-500">
                  Form {currentFormIndex ?? 1} of {totalFormSteps}
                </p>
                {currentFormQuestions.map(question => (
                  <FormQuestion
                    key={question.question_code}
                    question={question}
                    value={currentFormAnswers[question.question_code]}
                    required={question.type !== 'checkbox'}
                  />
                ))}
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Saving...' : 'Save and continue'}
                </Button>
              </fetcher.Form>
            ) : (
              <fetcher.Form method="post" className="flex flex-col gap-6">
                <input type="hidden" name="role" value={role ?? 'student'} />
                <input type="hidden" name="pid" value={pid} />
                <input type="hidden" name="step" value="invite" />
                <input type="hidden" name="firstname" value={firstname ?? ''} />
                <input type="hidden" name="surname" value={surname ?? ''} />
                <input type="hidden" name="phone" value={phone ?? ''} />
                <input type="hidden" name="postcode" value={postcode ?? ''} />
                <div className="grid gap-2">
                  <Label htmlFor="invite-email">{inviteLabel}</Label>
                  <Input id="invite-email" name="invite-email" type="email" required />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending invite...' : 'Send Invite'}
                </Button>
              </fetcher.Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
