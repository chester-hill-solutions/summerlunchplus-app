import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from 'react-router'
import { useEffect, useRef, useState } from 'react'

import type { Route } from './+types/enroll'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { sendTemplateEmail } from '@/lib/email/send-email.server'
import { createActionProfile } from '@/lib/action-profile.server'
import { createLoaderProfile } from '@/lib/loader-profile.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { requireAuth } from '@/lib/auth.server'
import { resolveFamilyGraph } from '@/lib/family.server'
import {
  buildWorkshopCapacityMap,
  getWorkshopEnrollmentAction,
  type WorkshopCapacitySnapshot,
} from '@/lib/workshop-capacity'
import { resolveSemesterSurveyForm } from '@/lib/semester-survey.server'
import { createClient } from '@/lib/supabase/server'
import { transitionWorkshopEnrollmentStatus } from '@/lib/workshop-enrollment-status.server'

type WorkshopRow = {
  id: string
  description: string | null
  enrollment_open_at: string | null
  enrollment_close_at: string | null
  capacity: number
  wait_list_capacity: number
}

type SemesterRow = {
  id: string
  name: string | null
  starts_at: string
  ends_at: string
  enrollment_open_at: string | null
  enrollment_close_at: string | null
  workshops: WorkshopRow[]
}

type EnrollmentRow = {
  id: string
  workshop_id: string
  semester_id: string
  profile_id: string | null
  status: string
}

type LoaderData = {
  semesters: SemesterRow[]
  enrollments: EnrollmentRow[]
  workshopCapacityById: Record<string, WorkshopCapacitySnapshot>
  nextClassByWorkshopId: Record<string, string | null>
  preSurveyBySemester: Record<string, { required: boolean; completed: boolean; preSurveyPath: string | null }>
  selectedSemesterId: string | null
}

type ActionData = {
  error?: string
}

type EnrollmentRequestResult = {
  ok: boolean
  enrollment_id: string | null
  enrollment_status: 'pending' | 'waitlisted' | 'approved' | 'rejected' | 'revoked' | null
  error_code: string | null
  error_message: string | null
}

const ENROLLMENT_SUCCESS_MESSAGE =
  "Thank you for registering for summerlunch+! We're excited to welcome your family this summer. Your registration has been received and is currently pending approval. Our team will review your information and send you a confirmation email shortly with your program details, class schedule, and next steps."

const ACTIVE_ENROLLMENT_STATUSES = new Set(['pending', 'waitlisted', 'approved'])

const redirectWithEnrollmentMessage = (status: 'success' | 'error', message: string) => {
  const params = new URLSearchParams({
    enrollmentStatus: status,
    enrollmentMessage: message,
  })

  return redirect(`/home?${params.toString()}`)
}

type FamilyProfileEmailRow = {
  id: string
  user_id: string | null
  email: string | null
  firstname: string | null
  surname: string | null
}

type EmailRecipient = {
  profileId: string | null
  userId: string | null
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))

const getFamilyEnrollmentProfileId = (family: Awaited<ReturnType<typeof resolveFamilyGraph>>) => {
  if (family.profileRole === 'guardian') {
    return family.primaryChildByGuardian.get(family.profileId) ?? null
  }
  return family.profileId
}

const semesterSurveyPath = (semesterId: string) =>
  `/semester-surveys/${semesterId}/pre-program?returnTo=${encodeURIComponent(`/enroll/${semesterId}`)}`

const toDisplayName = (profile: Pick<FamilyProfileEmailRow, 'firstname' | 'surname' | 'email'>) => {
  const fullName = [profile.firstname, profile.surname].filter(Boolean).join(' ').trim()
  return fullName || profile.email || 'A family member'
}

const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export async function loader({ request }: Route.LoaderArgs) {
  const profile = createLoaderProfile({
    name: 'enroll_loader',
    request,
  })
  const auth = await requireAuth(request)
  profile.mark('require_auth', {
    role: auth.claims.role,
    emailHint: auth.emailHint,
  })
  const { supabase, headers } = createClient(request)

  let family
  try {
    family = await resolveFamilyGraph(supabase, auth.user.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile not found'
    throw new Response(message, { status: 404, headers })
  }
  profile.mark('resolve_family_graph', {
    familyProfileIds: family.familyProfileIds.length,
  })

  const url = new URL(request.url)
  const enrollPathMatch = url.pathname.match(/^\/enroll\/([^/]+)$/)
  const pathSemesterId = enrollPathMatch?.[1] ? decodeURIComponent(enrollPathMatch[1]) : null
  const querySemesterId = url.searchParams.get('semester')
  const selectedSemesterId = pathSemesterId ?? querySemesterId
  const nowIso = new Date().toISOString()

  if (!pathSemesterId && querySemesterId) {
    throw redirect(`/enroll/${querySemesterId}`, { headers })
  }

  const [{ data: semesterData }, { data: enrollmentsData }] = await Promise.all([
    supabase
      .from('semester')
      .select('id, name, starts_at, ends_at, enrollment_open_at, enrollment_close_at, workshop (id, description, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity)')
      .order('starts_at', { ascending: true }),
    supabase
      .from('workshop_enrollment')
      .select('id, workshop_id, semester_id, profile_id, status')
      .in('profile_id', family.familyProfileIds)
      .order('requested_at', { ascending: false }),
  ])
  profile.mark('fetch_semesters_and_enrollments')

  const semesters: SemesterRow[] = (semesterData ?? [])
    .map((s: any) => ({
      id: String(s.id),
      name: s.name ? String(s.name) : null,
      starts_at: String(s.starts_at),
      ends_at: String(s.ends_at),
      enrollment_open_at: s.enrollment_open_at ? String(s.enrollment_open_at) : null,
      enrollment_close_at: s.enrollment_close_at ? String(s.enrollment_close_at) : null,
      workshops: (s.workshop ?? [])
        .filter((w: any) => typeof w?.id === 'string' && Boolean(w.id))
        .map((w: any) => ({
          id: String(w.id),
          description: w.description ? String(w.description) : null,
          enrollment_open_at: w.enrollment_open_at ? String(w.enrollment_open_at) : null,
          enrollment_close_at: w.enrollment_close_at ? String(w.enrollment_close_at) : null,
          capacity: Number(w.capacity ?? 0),
          wait_list_capacity: Number(w.wait_list_capacity ?? 0),
        })),
    }))
    .filter(semester => semester.workshops.length > 0)

  if (!selectedSemesterId) {
    const nowIso = new Date().toISOString()
    const openSemesters = semesters.filter(semester => {
      const opensAt = semester.enrollment_open_at
      const closesAt = semester.enrollment_close_at
      return (!opensAt || nowIso >= opensAt) && (!closesAt || nowIso <= closesAt)
    })

    if (openSemesters.length === 1) {
      throw redirect(`/enroll/${openSemesters[0].id}`, { headers })
    }
  }

  const workshops = semesters.flatMap(semester => semester.workshops)
  const workshopIds = workshops.map(workshop => workshop.id)
  const [workshopEnrollmentResult, upcomingClassesResult] = await Promise.all([
    workshopIds.length
      ? adminClient
          .from('workshop_enrollment')
          .select('workshop_id, status')
          .in('workshop_id', workshopIds)
      : Promise.resolve({ data: [] as Array<{ workshop_id: string | null; status: string | null }> }),
    workshopIds.length
      ? supabase
          .from('class')
          .select('workshop_id, starts_at')
          .in('workshop_id', workshopIds)
          .gt('starts_at', nowIso)
          .order('starts_at', { ascending: true })
      : Promise.resolve({ data: [] as Array<{ workshop_id: string | null; starts_at: string }> }),
  ])
  profile.mark('fetch_workshop_capacity_and_next_classes', {
    workshopCount: workshopIds.length,
  })

  const workshopEnrollmentRows = workshopEnrollmentResult.data ?? []
  const upcomingClasses = upcomingClassesResult.data ?? []

  const nextClassByWorkshopId: Record<string, string | null> = Object.fromEntries(
    workshopIds.map(workshopId => [workshopId, null])
  )

  for (const classRow of upcomingClasses) {
    const workshopId = classRow.workshop_id
    if (!workshopId || nextClassByWorkshopId[workshopId]) continue
    nextClassByWorkshopId[workshopId] = classRow.starts_at
  }

  const workshopCapacityById = Object.fromEntries(
    Array.from(
      buildWorkshopCapacityMap(workshops, workshopEnrollmentRows ?? []).entries(),
      ([workshopId, snapshot]) => [workshopId, snapshot]
    )
  )

  const targetProfileId = getFamilyEnrollmentProfileId(family)
  const semesterIds = semesters.map(semester => semester.id)
  const preSurveyFormBySemester = new Map<string, { formId: string | null; required: boolean }>()
  await Promise.all(
    semesterIds.map(async semesterId => {
      preSurveyFormBySemester.set(semesterId, await resolveSemesterSurveyForm(semesterId, 'pre_program_survey'))
    })
  )
  profile.mark('resolve_pre_survey_forms', {
    semesterCount: semesterIds.length,
  })

  const preSurveyFormIds = Array.from(preSurveyFormBySemester.values())
    .map(entry => entry.formId)
    .filter((formId): formId is string => Boolean(formId))
  const { data: preSurveySubmissions } =
    targetProfileId && preSurveyFormIds.length
      ? await adminClient
          .from('form_submission')
          .select('form_id')
          .eq('profile_id', targetProfileId)
          .in('form_id', preSurveyFormIds)
      : { data: [] }

  const completedPreSurveyFormIds = new Set(
    (preSurveySubmissions ?? []).map(submission => submission.form_id).filter(Boolean)
  )

  const preSurveyBySemester = Object.fromEntries(
    semesterIds.map(semesterId => {
      const survey = preSurveyFormBySemester.get(semesterId)
      const formId = survey?.formId ?? null
      const required = survey?.required ?? true
      return [
        semesterId,
        {
          required,
          completed: Boolean(formId && completedPreSurveyFormIds.has(formId)),
          preSurveyPath: formId ? semesterSurveyPath(semesterId) : null,
        },
      ]
    })
  )

  const enrollments: EnrollmentRow[] = (enrollmentsData ?? []).map((e: any) => ({
    id: String(e.id),
    workshop_id: String(e.workshop_id),
    semester_id: String(e.semester_id),
    profile_id: e.profile_id ? String(e.profile_id) : null,
    status: String(e.status),
  }))

  profile.complete({
    role: auth.claims.role,
    emailHint: auth.emailHint,
    semesterCount: semesters.length,
    enrollmentCount: enrollments.length,
    selectedSemesterId,
  })

  return {
    semesters,
    enrollments,
    workshopCapacityById,
    nextClassByWorkshopId,
    preSurveyBySemester,
    selectedSemesterId,
  } satisfies LoaderData
}

export async function action({ request }: Route.ActionArgs) {
  const profile = createActionProfile({
    name: 'enroll_action',
    request,
  })
  let outcome = 'unknown'
  let intent: string | null = null
  let emailHint: string | null = null
  let role: string | null = null
  const formData = await request.formData()
  intent = String(formData.get('intent') ?? 'request-enrollment')
  const status = String(formData.get('status') ?? '')
  const workshop_id = String(formData.get('workshop_id') ?? '')

  try {
    const auth = await requireAuth(request)
    emailHint = auth.emailHint
    role = auth.claims.role
    profile.mark('require_auth', {
      role: auth.claims.role,
      emailHint: auth.emailHint,
      intent,
    })
    const { supabase } = createClient(request)

    let family
    try {
      family = await resolveFamilyGraph(supabase, auth.user.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Profile not found'
      outcome = 'family_missing'
      return { error: message } satisfies ActionData
    }
    profile.mark('resolve_family_graph', {
      familyProfileIds: family.familyProfileIds.length,
    })

    if (intent === 'update-status') {
    const enrollmentId = String(formData.get('enrollment_id') ?? '')
    const semesterId = String(formData.get('semester_id') ?? '')

      if (!enrollmentId || !semesterId || status !== 'revoked') {
        outcome = 'update_status_invalid_payload'
        return { error: 'Missing enrollment data for status update.' } satisfies ActionData
      }

      const transitionResult = await transitionWorkshopEnrollmentStatus({
      enrollmentId,
      nextStatus: 'revoked',
      actorUserId: auth.user.id,
      scope: 'family',
      semesterId,
      familyProfileIds: family.familyProfileIds,
    })

      profile.mark('transition_workshop_enrollment_status', {
        ok: transitionResult.ok,
      })

      if (!transitionResult.ok) {
        outcome = 'update_status_transition_failed'
        return { error: transitionResult.error ?? 'Unable to update enrollment status.' } satisfies ActionData
      }

      outcome = 'update_status_success'
      return redirect(`/enroll/${semesterId}`)
    }

  const { data: workshopRow, error: workshopError } = await supabase
    .from('workshop')
    .select('id, semester_id, description, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity')
    .eq('id', workshop_id)
    .single()

    if (workshopError || !workshopRow?.semester_id) {
      outcome = 'workshop_not_found'
      return { error: 'Workshop not found' } satisfies ActionData
    }

    const targetProfileId = getFamilyEnrollmentProfileId(family)
    if (!targetProfileId) {
      outcome = 'target_profile_missing'
      return { error: 'Family enrollment profile not found.' } satisfies ActionData
    }

  const preSurveyForm = await resolveSemesterSurveyForm(workshopRow.semester_id, 'pre_program_survey')

    if (!preSurveyForm.formId) {
      outcome = 'pre_survey_not_configured'
      return { error: 'Pre-program survey is not configured for this semester.' } satisfies ActionData
    }

  const { data: preSurveySubmission } = preSurveyForm.required
    ? await adminClient
        .from('form_submission')
        .select('id')
        .eq('form_id', preSurveyForm.formId)
        .eq('profile_id', targetProfileId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: { id: 'not-required' } }

    if (preSurveyForm.required && !preSurveySubmission?.id) {
      outcome = 'pre_survey_required'
      return { error: 'Please complete the pre-program survey before enrolling.' } satisfies ActionData
    }

  const { data: enrollmentResult, error: enrollmentRequestError } = await adminClient
    .rpc('request_family_workshop_enrollment', {
      p_workshop_id: workshop_id,
      p_profile_id: targetProfileId,
      p_family_profile_ids: family.familyProfileIds,
    })
    .single()

  const enrollmentRequest = enrollmentResult as EnrollmentRequestResult | null

    if (enrollmentRequestError) {
      outcome = 'enrollment_request_error'
      return { error: enrollmentRequestError.message ?? 'Unable to create enrollment' } satisfies ActionData
    }

    if (!enrollmentRequest?.ok || !enrollmentRequest.enrollment_id) {
      outcome = 'enrollment_request_not_ok'
      return {
        error: enrollmentRequest?.error_message ?? 'Unable to create enrollment',
      } satisfies ActionData
    }

  const enrollmentId = enrollmentRequest.enrollment_id

  const { data: familyProfilesData } = await adminClient
    .from('profile')
    .select('id, user_id, email, firstname, surname')
    .in('id', family.familyProfileIds)

  const familyProfiles = (familyProfilesData ?? []) as FamilyProfileEmailRow[]
  const actorProfile =
    familyProfiles.find(profile => profile.user_id === auth.user.id) ??
    familyProfiles.find(profile => profile.id === family.profileId) ??
    null

  const actorName = actorProfile ? toDisplayName(actorProfile) : auth.user.email ?? 'A family member'
  const actorEmail = actorProfile?.email ?? auth.user.email ?? 'Unknown email'
  const workshopName = workshopRow.description?.trim() || 'selected workshop'

  const emailByLowercase = new Map<string, EmailRecipient>()
  for (const profile of familyProfiles) {
    const rawEmail = profile.email?.trim()
    if (!rawEmail || !isLikelyEmail(rawEmail)) continue
    const normalized = rawEmail.toLowerCase()
    if (!emailByLowercase.has(normalized)) {
      emailByLowercase.set(normalized, { profileId: profile.id, userId: profile.user_id })
    }
  }

  if (isLikelyEmail(actorEmail)) {
    const normalizedActorEmail = actorEmail.trim().toLowerCase()
    if (!emailByLowercase.has(normalizedActorEmail)) {
      emailByLowercase.set(normalizedActorEmail, {
        profileId: actorProfile?.id ?? null,
        userId: auth.user.id,
      })
    }
  }

    const notificationEventKey = `workshop_enrollment:${enrollmentId}:family_requested:v1`
    setTimeout(() => {
    void Promise.all(
      Array.from(emailByLowercase.entries()).map(async ([normalizedEmail, recipient]) => {
        return sendTemplateEmail({
          toEmail: normalizedEmail,
          templateKey: 'family_enrollment_requested_v1',
          templateData: {
            actorName,
            actorEmail,
            workshopName,
          },
          eventKey: notificationEventKey,
          triggeredByUserId: auth.user.id,
          recipientUserId: recipient.userId,
          profileId: recipient.profileId,
          familyProfileId: targetProfileId,
          workshopEnrollmentId: enrollmentId,
        })
      })
    )
      .then(notificationResults => {
        const failedNotifications = notificationResults.filter(result => result.status === 'failed')
        if (failedNotifications.length > 0) {
          console.error('[enroll] failed to send some family enrollment notifications', {
            workshopEnrollmentId: enrollmentId,
            failures: failedNotifications,
          })
        }
      })
      .catch(error => {
        console.error('[enroll] notification dispatch failed', {
          workshopEnrollmentId: enrollmentId,
          error,
        })
      })
    }, 0)

    outcome = 'request_enrollment_success'
    return redirectWithEnrollmentMessage('success', ENROLLMENT_SUCCESS_MESSAGE)
  } finally {
    profile.complete({
      intent,
      outcome,
      emailHint,
      role,
      workshopId: workshop_id || null,
    })
  }
}

export default function EnrollPage() {
  const { semesters, enrollments, workshopCapacityById, nextClassByWorkshopId, preSurveyBySemester, selectedSemesterId } = useLoaderData<LoaderData>()
  const actionData = useActionData<ActionData>()
  const navigation = useNavigation()
  const [submitLocked, setSubmitLocked] = useState(false)
  const navigationStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const shouldLog = import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'
    if (!shouldLog) return
    if (navigation.state === 'submitting' && navigation.formMethod?.toLowerCase() === 'post') {
      navigationStartedAtRef.current = performance.now()
      console.info('[enroll-instrumentation]', {
        event: 'form_submit_start',
        intent: navigation.formData?.get('intent') ?? 'request-enrollment',
        workshopId: navigation.formData?.get('workshop_id') ?? null,
        enrollmentId: navigation.formData?.get('enrollment_id') ?? null,
      })
      return
    }
    if (navigation.state === 'idle') {
      const startedAt = navigationStartedAtRef.current
      if (typeof startedAt === 'number') {
        console.info('[enroll-instrumentation]', {
          event: 'form_submit_end',
          durationMs: Math.round(performance.now() - startedAt),
        })
        navigationStartedAtRef.current = null
      }
    }
  }, [navigation.formData, navigation.formMethod, navigation.state])

  useEffect(() => {
    if (navigation.state === 'idle' && actionData?.error) {
      setSubmitLocked(false)
    }
  }, [actionData?.error, navigation.state])

  const mutationLocked =
    submitLocked ||
    navigation.state !== 'idle' &&
    typeof navigation.formMethod === 'string' &&
    navigation.formMethod.toLowerCase() === 'post'

  const semesterId = selectedSemesterId
  const selectedSemester = semesterId ? semesters.find(semester => semester.id === semesterId) : null
  const semesterEnrollment =
    semesterId
      ? enrollments.find(
          enrollment => enrollment.semester_id === semesterId && ACTIVE_ENROLLMENT_STATUSES.has(enrollment.status)
        )
      : null

  return (
    <main className="flex w-full flex-col gap-6 px-6 pt-6 pb-10">
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link to="/home">Family Workshops</Link>
        </Button>
        <Button asChild>
          <Link to="/enroll">Manage Enrollments</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/home?tab=manage-family">Manage Family</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Manage Enrollments</h1>
        <p className="text-sm text-muted-foreground">Step 1: select a semester. Step 2: complete pre-program survey. Step 3: choose one workshop.</p>
        {actionData?.error ? <p className="text-sm text-destructive">{actionData.error}</p> : null}
      </div>

      {!selectedSemester ? (
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semester ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Pre-program survey</TableHead>
                <TableHead>Enrollment</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {semesters.map(semester => {
                const preSurvey = preSurveyBySemester[semester.id]
                const status = enrollments.find(
                  enrollment => enrollment.semester_id === semester.id && ACTIVE_ENROLLMENT_STATUSES.has(enrollment.status)
                )?.status
                return (
                  <TableRow key={semester.id}>
                    <TableCell className="font-medium">{semester.id.slice(0, 8)}</TableCell>
                    <TableCell>{semester.name ?? 'Unnamed semester'}</TableCell>
                    <TableCell>{formatDate(semester.starts_at)} - {formatDate(semester.ends_at)}</TableCell>
                    <TableCell>
                      {preSurvey?.required
                        ? preSurvey.completed
                          ? 'Complete'
                          : 'Required'
                        : 'Optional'}
                    </TableCell>
                    <TableCell className="capitalize">{status ?? 'Not enrolled'}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/enroll/${semester.id}`}>Select semester</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {selectedSemester.name ?? `Semester ${selectedSemester.id.slice(0, 8)}`}
            </h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/enroll">Change semester</Link>
            </Button>
          </div>

          {semesterEnrollment ? (
            <div className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
              <p className="font-medium">Your family is already enrolled in one workshop for this semester.</p>
              <p className="text-sm text-muted-foreground capitalize">Enrollment status: {semesterEnrollment.status}</p>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/home">Back to Family Workshops</Link>
                </Button>
                {(semesterEnrollment.status === 'pending' || semesterEnrollment.status === 'waitlisted') && semesterId ? (
                  <Form method="post" onSubmit={() => setSubmitLocked(true)}>
                    <input type="hidden" name="intent" value="update-status" />
                    <input type="hidden" name="status" value="revoked" />
                    <input type="hidden" name="enrollment_id" value={semesterEnrollment.id} />
                    <input type="hidden" name="semester_id" value={semesterId} />
                    <Button type="submit" variant="destructive" size="sm" disabled={mutationLocked}>
                      {mutationLocked ? 'Revoking...' : 'Revoke request'}
                    </Button>
                  </Form>
                ) : null}
              </div>
            </div>
          ) : preSurveyBySemester[selectedSemester.id]?.required &&
            !preSurveyBySemester[selectedSemester.id]?.completed ? (
            <div className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
              <p className="font-medium">Complete pre-program survey before choosing a workshop.</p>
              <p className="text-sm text-muted-foreground">
                As part of summerlunch+, we&apos;ll ask a few questions about your family&apos;s nutrition
                knowledge, cooking skills, eating habits, and more. Parents or caregivers are invited to
                complete this survey together with their Jr. Chef.
              </p>
              {preSurveyBySemester[selectedSemester.id]?.preSurveyPath ? (
                <Button asChild>
                  <Link to={preSurveyBySemester[selectedSemester.id].preSurveyPath as string}>Complete pre-program survey</Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Pre-program survey is not configured yet for this semester.</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
              <p className="text-sm text-muted-foreground">
                Here are the cooking classes we are offering this summer. Please take a moment to sign up for one class that works best for your schedule, choosing a date and time that you can attend each week. Please note some classes are running in different time zones.
              </p>
              <p className="text-sm text-muted-foreground">You can enroll in one workshop for this semester.</p>
              {(() => {
                const sortedWorkshops = selectedSemester.workshops
                  .slice()
                  .sort((a, b) => {
                    const nextA = nextClassByWorkshopId[a.id]
                    const nextB = nextClassByWorkshopId[b.id]

                    if (nextA && nextB) {
                      const byNextClass = new Date(nextA).getTime() - new Date(nextB).getTime()
                      if (byNextClass !== 0) return byNextClass
                    } else if (nextA) {
                      return -1
                    } else if (nextB) {
                      return 1
                    }

                    return (a.description ?? '').localeCompare(b.description ?? '')
                  })

                return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workshop</TableHead>
                    <TableHead>Next class</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead>Waitlist</TableHead>
                    <TableHead>Enrollment window</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedWorkshops.map(workshop => {
                    const capacitySnapshot = workshopCapacityById[workshop.id]
                    const enrollmentAction = capacitySnapshot
                      ? getWorkshopEnrollmentAction(capacitySnapshot)
                      : 'enroll'
                    const isFull = enrollmentAction === 'full'
                    const actionLabel = enrollmentAction === 'waitlist' ? 'Join waitlist' : 'Request enrollment'
                    const nextClass = nextClassByWorkshopId[workshop.id]

                    return (
                      <TableRow key={workshop.id}>
                        <TableCell className="font-medium">{workshop.description ?? 'Workshop'}</TableCell>
                        <TableCell className="text-muted-foreground">{nextClass ? formatDateTime(nextClass) : 'No upcoming class'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {capacitySnapshot
                            ? `${capacitySnapshot.approvedCount} / ${capacitySnapshot.capacity}`
                            : `0 / ${workshop.capacity}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {capacitySnapshot
                            ? `${capacitySnapshot.waitlistedCount} / ${capacitySnapshot.waitListCapacity}`
                            : `0 / ${workshop.wait_list_capacity}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {(workshop.enrollment_open_at ? formatDate(workshop.enrollment_open_at) : 'Open')}
                          {' - '}
                          {(workshop.enrollment_close_at ? formatDate(workshop.enrollment_close_at) : 'Close')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Form method="post" className="inline-flex justify-end" onSubmit={() => setSubmitLocked(true)}>
                            <input type="hidden" name="workshop_id" value={workshop.id} />
                            <Button type="submit" disabled={isFull || mutationLocked} size="sm">
                              {isFull ? 'Full' : mutationLocked ? 'Submitting...' : actionLabel}
                            </Button>
                          </Form>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
                )
              })()}
            </div>
          )}
        </div>
      )}

    </main>
  )
}
