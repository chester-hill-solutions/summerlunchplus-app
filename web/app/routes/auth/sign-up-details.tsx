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

type LoaderStep = 'guardian' | 'child' | 'details' | 'forms' | 'invite'

type LoaderData = {
  role: 'guardian' | 'student' | null
  pid: string
  step: LoaderStep
  firstname: string | null
  surname: string | null
  phone: string | null
  postcode: string | null
  partnerProgram: string | null
  inviterPid: string | null
  inviterRole: 'guardian' | 'student' | null
  hasRelationship: boolean
  childEmailChoice: 'yes' | 'no' | null
  formSteps: FormStep[]
  currentForm: FormStep | null
  currentFormQuestions: FormQuestionData[]
  currentFormAnswers: Record<string, Json>
  currentFormIndex: number | null
  totalFormSteps: number
  formsComplete: boolean
}

const PARTNER_SITE_OPTIONS = [
  'Thorncliffe Park -TNO',
  'Taylor-Massey & Oakridge',
  'Thorncliffe Park (TNO)',
  'Milton Food for Life',
  'Gloucester -GEFC',
  'Orangeville Food Bank',
  'Cresent Town Community',
  'Eastview Community Centre',
  'Greenest City',
  'Partage Vanier',
  'Parkdale Community Food Bank',
  'Hamilton - Eva Rothwell Centre',
  'Other',
  'Corktown Community',
]

const formControlClasses =
  'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw redirect('/auth/sign-up', { headers })

  const url = new URL(request.url)
  const childEmailChoiceParam = url.searchParams.get('child_email')
  const childEmailChoice =
    childEmailChoiceParam === 'yes' || childEmailChoiceParam === 'no' ? childEmailChoiceParam : null
  const requestedFormId = url.searchParams.get('form_id')
  const roleParam = url.searchParams.get('role') as 'guardian' | 'student' | null
  const pidParam = url.searchParams.get('pid')

  let pid = pidParam
  if (!pid) {
    const { data: profileCandidate } = await supabase
      .from('profile')
      .select('id')
      .eq('user_id', userData.user.id)
      .single()
    if (!profileCandidate?.id) throw redirect('/auth/sign-up', { headers })
    pid = profileCandidate.id
  }
  if (!pid) throw redirect('/auth/sign-up', { headers })

  const { data: profile } = await supabase
    .from('profile')
    .select('firstname, surname, phone, postcode, role, partner_program')
    .eq('id', pid)
    .single()
  if (!profile) throw redirect('/auth/sign-up', { headers })

  const resolvedRole = (roleParam ?? (profile.role as 'guardian' | 'student') ?? 'student') as 'guardian' | 'student'
  const isGuardian = resolvedRole === 'guardian'
  const requestedStep = ((url.searchParams.get('step') as LoaderStep) ||
    (isGuardian ? 'guardian' : 'details')) as LoaderStep
  const guardianComplete = Boolean(
    profile.firstname && profile.surname && profile.phone && profile.postcode && profile.partner_program
  )
  const detailsComplete = isGuardian
    ? guardianComplete
    : Boolean(profile.firstname && profile.surname && profile.phone && profile.postcode && profile.partner_program)

  const { data: relationship } = await supabase
    .from('person_guardian_child')
    .select('id')
    .or(`child_profile_id.eq.${pid},guardian_profile_id.eq.${pid}`)
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
      .from('form_question_map')
      .select('question_code, position, prompt_override, options_override, form_question ( prompt, type, options )')
      .eq('form_id', currentForm.formId)
      .order('position')
    currentFormQuestions = (questions ?? []).map(q => {
      const base = Array.isArray(q.form_question) ? q.form_question[0] : q.form_question
      return {
        question_code: q.question_code ?? '',
        prompt: q.prompt_override ?? base?.prompt ?? '',
        type: (base?.type ?? 'text') as Database['public']['Enums']['form_question_type'],
        options: (q.options_override ?? base?.options ?? []) as Json,
      }
    })
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

  if (!isGuardian) {
    if (formsComplete && detailsComplete && inviteEnabled && requestedStep !== 'invite') {
      const nextUrl = new URL(request.url)
      nextUrl.searchParams.set('step', 'invite')
      nextUrl.searchParams.delete('form_id')
      return redirect(nextUrl.toString(), { headers })
    }

    if (formsComplete && detailsComplete && !inviteEnabled) {
      return redirect('/home', { headers })
    }
  }

  if (isGuardian && formsComplete && guardianComplete && hasRelationship) {
    return redirect('/home', { headers })
  }

  let effectiveStep: LoaderStep = requestedStep
  if (isGuardian) {
    if (!guardianComplete) {
      effectiveStep = 'guardian'
    } else if (!hasRelationship && effectiveStep !== 'invite') {
      effectiveStep = effectiveStep === 'forms' || effectiveStep === 'guardian' ? 'child' : effectiveStep
    }
    if (effectiveStep === 'invite' && childEmailChoice !== 'yes' && !hasRelationship) {
      effectiveStep = 'child'
    }
    if (effectiveStep === 'forms' && (!formSteps.length || formsComplete)) {
      effectiveStep = hasRelationship ? 'forms' : 'child'
    }
    if (effectiveStep === 'child' && hasRelationship) {
      effectiveStep = 'forms'
    }
  } else {
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
  }

  return {
    role: resolvedRole,
    pid,
    step: effectiveStep,
    firstname: profile.firstname,
    surname: profile.surname,
    phone: profile.phone,
    postcode: profile.postcode,
    partnerProgram: profile.partner_program ?? null,
    inviterPid: url.searchParams.get('inviter_pid'),
    inviterRole: (url.searchParams.get('inviter_role') as 'guardian' | 'student') ?? null,
    hasRelationship,
    childEmailChoice,
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
  const role = formData.get('role') as 'guardian' | 'student'
  const pid = formData.get('pid') as string
  const step = (formData.get('step') as LoaderStep) ?? 'details'
  const firstname = (formData.get('firstname') as string)?.trim()
  const surname = (formData.get('surname') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim()
  const postcode = (formData.get('postcode') as string)?.trim()
  const partnerProgramValue = (formData.get('partner-program') as string)?.trim() ?? ''
  const dateOfBirth = (formData.get('date_of_birth') as string)?.trim()
  const childFirstname = (formData.get('child_firstname') as string)?.trim()
  const childSurname = (formData.get('child_surname') as string)?.trim()
  const childEmailChoice = (formData.get('child_email') as string)?.trim()
  const inviteEmail = (formData.get('invite-email') as string)?.trim()
  const postalRe = /^[A-Z]\d[A-Z] \d[A-Z]\d$/
  const { data: currentUser } = await supabase.auth.getUser()
  const inviterEmail = currentUser?.user?.email ?? ''

  if (step === 'forms') {
    const formId = formData.get('form_id') as string
    if (!formId) {
      return { error: 'Form is missing' }
    }

    const { data: questionRows } = await supabase
      .from('form_question_map')
      .select('question_code, prompt_override, options_override, form_question ( prompt, type, options )')
      .eq('form_id', formId)
      .order('position')
    const questions = questionRows ?? []
    if (!questions.length) {
      return { error: 'Form is not configured' }
    }

    const userId = currentUser?.user?.id
    if (!userId) {
      return { error: 'Unable to identify user' }
    }

    const answers: { questionCode: string; value: Json }[] = []
    for (const question of questions) {
      const base = Array.isArray(question.form_question) ? question.form_question[0] : question.form_question
      const prompt = question.prompt_override ?? base?.prompt ?? ''
      const type = base?.type as Database['public']['Enums']['form_question_type']
      const fieldName = `question_${question.question_code}`
      if (type === 'multi_choice') {
        const choices = formData
          .getAll(fieldName)
          .filter((value): value is string => typeof value === 'string')
        if (!choices.length) {
          return { error: `Please answer "${prompt}"` }
        }
        answers.push({ questionCode: question.question_code, value: choices })
        continue
      }

      if (type === 'checkbox') {
        const checked = formData.has(fieldName)
        answers.push({ questionCode: question.question_code, value: checked })
        continue
      }

      const rawValue = (formData.get(fieldName) as string | null)?.trim() ?? ''
      if (!rawValue) {
        return { error: `Please answer "${prompt}"` }
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

  if (step === 'guardian') {
    if (!firstname || !surname || !phone || !postcode) {
      return { error: 'All fields are required' }
    }
    if (!postalRe.test(postcode)) {
      return { error: 'Postal code must match A1A 1A1 format' }
    }
    if (!partnerProgramValue) {
      return { error: 'Please select which site you are attending from' }
    }

    const userId = currentUser?.user?.id
    if (!userId) {
      return { error: 'Unable to identify user' }
    }

    const profilePayload: Record<string, unknown> = {
      id: pid,
      user_id: userId,
      firstname,
      surname,
      phone,
      postcode,
      email: inviterEmail,
      partner_program: partnerProgramValue,
      role,
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from('profile')
      .update(profilePayload)
      .eq('id', pid)
      .select('id')
      .single()
    if (updateError) {
      console.error('profile update failed', updateError.message, { pid, profilePayload })
    }

    if (!updatedProfile?.id) {
      const { data: insertedProfile, error: insertError } = await supabase
        .from('profile')
        .insert(profilePayload)
        .select('id')
        .single()
      if (insertError) {
        console.error('profile insert fallback failed', insertError.message, { pid, profilePayload })
      }
      if (insertError || !insertedProfile?.id) {
        return { error: insertError?.message ?? 'Unable to save profile' }
      }
    }

    return redirect(`/auth/sign-up-details?role=${role}&pid=${pid}&step=child`, { headers })
  }

  if (step === 'child') {
    if (childEmailChoice !== 'yes' && childEmailChoice !== 'no') {
      return { error: 'Please select whether your child will use their own email' }
    }

    if (childEmailChoice === 'yes') {
      return redirect(`/auth/sign-up-details?role=${role}&pid=${pid}&step=invite&child_email=yes`, { headers })
    }

    if (!childFirstname || !childSurname) {
      return { error: 'Child first and last name are required' }
    }

    const { data: existingLink } = await supabase
      .from('person_guardian_child')
      .select('id')
      .eq('guardian_profile_id', pid)
      .eq('primary_child', true)
      .maybeSingle()
    if (!existingLink?.id) {
      const { data: childProfile, error: childError } = await adminClient
        .from('profile')
        .insert({
          role: 'student',
          firstname: childFirstname,
          surname: childSurname,
        })
        .select('id')
        .single()
      if (childError || !childProfile?.id) {
        return { error: childError?.message ?? 'Unable to create child profile' }
      }

      const { error: linkError } = await adminClient.from('person_guardian_child').insert({
        guardian_profile_id: pid,
        child_profile_id: childProfile.id,
        primary_child: true,
      })
      if (linkError) {
        return { error: linkError.message }
      }
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
    if (!partnerProgramValue) {
      return { error: 'Please select which site you are attending from' }
    }
    const userId = currentUser?.user?.id
    console.log('sign-up-details action start', { pid, userId })
    if (!userId) {
      return { error: 'Unable to identify user' }
    }

    const profilePayload: Record<string, unknown> = {
      id: pid,
      user_id: userId,
      firstname,
      surname,
      phone,
      postcode,
      email: inviterEmail,
      partner_program: partnerProgramValue,
      role,
    }

    if (role === 'student') {
      profilePayload.date_of_birth = dateOfBirth || null
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from('profile')
      .update(profilePayload)
      .eq('id', pid)
      .select('id')
      .single()
    if (updateError) {
      console.error('profile update failed', updateError.message, { pid, profilePayload })
    }

    if (!updatedProfile?.id) {
      const { data: insertedProfile, error: insertError } = await supabase
        .from('profile')
        .insert(profilePayload)
        .select('id')
        .single()
      if (insertError) {
        console.error('profile insert fallback failed', insertError.message, { pid, profilePayload })
      }
      if (insertError || !insertedProfile?.id) {
        return { error: insertError?.message ?? 'Unable to save profile' }
      }
    }

    return redirect(`/auth/sign-up-details?role=${role}&pid=${pid}&step=forms`, { headers })
  }

  if (step === 'invite') {
    if (!inviteEmail) {
      return { error: 'Invite email is required' }
    }

    const targetRole = role === 'student' ? 'guardian' : 'student'
    const redirectTo = `${origin}/auth/sign-up-details?role=${targetRole}`
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(inviteEmail, {
      redirectTo,
      data: {
        inviter_profile_id: pid,
        inviter_role: role,
        inviter_email: inviterEmail,
        role: targetRole,
      },
    })
    let inviteeUserId = inviteData?.user?.id ?? null
    if (inviteError) {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email: inviteEmail,
        options: {
          redirectTo,
          data: {
            inviter_profile_id: pid,
            inviter_role: role,
            inviter_email: inviterEmail,
            role: targetRole,
          },
        },
      })
      if (linkError) {
        return { error: inviteError.message ?? linkError.message ?? 'Unable to send invite' }
      }
      inviteeUserId = linkData?.user?.id ?? inviteeUserId
    }

    const inviteeProfilePayload = {
      email: inviteEmail,
      role: targetRole,
      ...(inviteeUserId ? { user_id: inviteeUserId } : {}),
    }
    const { data: inviteeRow, error: inviteeError } = await supabase
      .from('profile')
      .upsert(inviteeProfilePayload, { onConflict: 'email' })
      .select('id')
      .single()
    if (inviteeError || !inviteeRow?.id) {
      return { error: inviteeError?.message ?? 'Unable to prepare invitee profile' }
    }
    const inviteePid = inviteeRow.id

    const childId = role === 'guardian' ? inviteePid : pid
    const guardianId = role === 'guardian' ? pid : inviteePid
    await supabase
      .from('person_guardian_child')
      .upsert(
        { child_profile_id: childId, guardian_profile_id: guardianId, primary_child: true },
        { onConflict: 'guardian_profile_id,child_profile_id' }
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

    return redirect(`/auth/sign-up-details?role=${role}&pid=${pid}&step=forms`, { headers })
  }
}

export default function SignUpDetails() {
  const fetcher = useFetcher<typeof action>()
  const data = useLoaderData() as LoaderData
  const {
    role,
    pid,
    step,
    childEmailChoice,
    firstname,
    surname,
    phone,
    postcode: loaderPostcode,
    partnerProgram: loaderPartnerProgram,
    formSteps,
    currentForm,
    currentFormQuestions,
    currentFormAnswers,
    currentFormIndex,
    totalFormSteps,
  } = data
  const [postcode, setPostcode] = useState(loaderPostcode ?? '')
  const [partnerProgram, setPartnerProgram] = useState(loaderPartnerProgram ?? '')
  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'
  const inviteLabel = role === 'student' ? "Guardian's email" : "Student's email"
  const [childEmailChoiceState, setChildEmailChoiceState] = useState<'' | 'yes' | 'no'>(
    childEmailChoice ?? ''
  )

  const formatPC = (val: string) => {
    const raw = val.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (raw.length <= 3) return raw
    return raw.slice(0, 3) + ' ' + raw.slice(3, 6)
  }

  const stageTitles: Record<LoaderStep, string> = {
    guardian: 'Guardian information',
    child: 'Child details',
    details: 'Complete your profile',
    forms: currentForm?.name ?? 'Required form',
    invite: 'Invite a Guardian/Student',
  }

  const stageDescriptions: Record<LoaderStep, string> = {
    guardian: 'Tell us about the guardian',
    child: 'Tell us about your child',
    details: 'One more step before you can continue',
    forms: 'Share the requested information to finish your sign-up',
    invite: 'Send an invite to your counterpart',
  }

  const formSummary = formSteps.length

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-3xl">
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
            {step === 'guardian' ? (
              <fetcher.Form method="post" className="flex flex-col gap-6">
                <input type="hidden" name="role" value={role ?? 'student'} />
                <input type="hidden" name="pid" value={pid} />
                <input type="hidden" name="step" value="guardian" />
                <div className="grid gap-2">
                  <Label htmlFor="firstname">Guardian First Name</Label>
                  <Input id="firstname" name="firstname" defaultValue={firstname ?? ''} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="surname">Guardian Surname</Label>
                  <Input id="surname" name="surname" defaultValue={surname ?? ''} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Guardian Phone Number</Label>
                  <Input id="phone" name="phone" type="tel" defaultValue={phone ?? ''} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="partner-program">Please select which site you are attending from</Label>
                  <select
                    id="partner-program"
                    name="partner-program"
                    value={partnerProgram}
                    onChange={e => setPartnerProgram(e.target.value)}
                    className={formControlClasses}
                    required
                  >
                    <option value="" disabled>
                      Select a site
                    </option>
                    {PARTNER_SITE_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="postcode">Guardian Postal Code</Label>
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
            ) : step === 'child' ? (
              <fetcher.Form method="post" className="flex flex-col gap-6">
                <input type="hidden" name="role" value={role ?? 'student'} />
                <input type="hidden" name="pid" value={pid} />
                <input type="hidden" name="step" value="child" />
                <fieldset className="grid gap-3">
                  <legend className="text-sm font-medium text-slate-900">
                    Will your child attend using their own email address?
                  </legend>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="child_email"
                      value="yes"
                      checked={childEmailChoiceState === 'yes'}
                      onChange={() => setChildEmailChoiceState('yes')}
                      className="h-4 w-4"
                    />
                    Yes, they have their own email
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="child_email"
                      value="no"
                      checked={childEmailChoiceState === 'no'}
                      onChange={() => setChildEmailChoiceState('no')}
                      className="h-4 w-4"
                    />
                    No, they do not have their own email
                  </label>
                </fieldset>
                {childEmailChoiceState === 'no' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="child_firstname">Child first name</Label>
                      <Input id="child_firstname" name="child_firstname" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="child_surname">Child surname</Label>
                      <Input id="child_surname" name="child_surname" required />
                    </div>
                  </div>
                )}
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Saving...' : 'Next'}
                </Button>
              </fetcher.Form>
            ) : step === 'details' ? (
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
                <div className="grid gap-2">
                  <Label htmlFor="partner-program">Please select which site you are attending from</Label>
                  <select
                    id="partner-program"
                    name="partner-program"
                    value={partnerProgram}
                    onChange={e => setPartnerProgram(e.target.value)}
                    className={formControlClasses}
                    required
                  >
                    <option value="" disabled>
                      Select a site
                    </option>
                    {PARTNER_SITE_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
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
                <input type="hidden" name="partner-program" value={partnerProgram ?? ''} />
                <input type="hidden" name="postcode" value={postcode ?? ''} />
                <div className="grid gap-2">
                  <Label htmlFor="invite-email">{inviteLabel}</Label>
                  <Input id="invite-email" name="invite-email" type="email" />
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
