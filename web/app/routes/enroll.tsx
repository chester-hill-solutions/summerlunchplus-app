import { Link, redirect, useLoaderData, useNavigation } from 'react-router'

import type { Route } from './+types/enroll'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { sendTemplateEmail } from '@/lib/email/send-email.server'
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

const ENROLLMENT_SUCCESS_MESSAGE =
  "Thank you for registering for summerlunch+! We're excited to welcome your family this summer. Your registration has been received and is currently pending approval. Our team will review your information and send you a confirmation email shortly with your program details, class schedule, and next steps."

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
  const auth = await requireAuth(request)
  const { supabase, headers } = createClient(request)

  let family
  try {
    family = await resolveFamilyGraph(supabase, auth.user.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile not found'
    throw new Response(message, { status: 404, headers })
  }

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

  const semesters: SemesterRow[] = (semesterData ?? []).map((s: any) => ({
    id: String(s.id),
    name: s.name ? String(s.name) : null,
    starts_at: String(s.starts_at),
    ends_at: String(s.ends_at),
    enrollment_open_at: s.enrollment_open_at ? String(s.enrollment_open_at) : null,
    enrollment_close_at: s.enrollment_close_at ? String(s.enrollment_close_at) : null,
    workshops: (s.workshop ?? []).map((w: any) => ({
      id: String(w.id),
      description: w.description ? String(w.description) : null,
      enrollment_open_at: w.enrollment_open_at ? String(w.enrollment_open_at) : null,
      enrollment_close_at: w.enrollment_close_at ? String(w.enrollment_close_at) : null,
      capacity: Number(w.capacity ?? 0),
      wait_list_capacity: Number(w.wait_list_capacity ?? 0),
    })),
  }))

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
      ? supabase
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
  const formData = await request.formData()
  const workshop_id = String(formData.get('workshop_id') ?? '')

  const auth = await requireAuth(request)
  const { supabase } = createClient(request)

  let family
  try {
    family = await resolveFamilyGraph(supabase, auth.user.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile not found'
    return redirectWithEnrollmentMessage('error', message)
  }

  const { data: workshopRow, error: workshopError } = await supabase
    .from('workshop')
    .select('id, semester_id, description, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity')
    .eq('id', workshop_id)
    .single()

  if (workshopError || !workshopRow?.semester_id) {
    return redirectWithEnrollmentMessage('error', 'Workshop not found')
  }

  const nowIso = new Date().toISOString()
  const enrollmentOpenAt = workshopRow.enrollment_open_at
  const enrollmentCloseAt = workshopRow.enrollment_close_at
  const isOpen = (!enrollmentOpenAt || nowIso >= enrollmentOpenAt) && (!enrollmentCloseAt || nowIso <= enrollmentCloseAt)
  if (!isOpen) {
    return redirectWithEnrollmentMessage('error', 'Enrollment is closed for this workshop')
  }

  const { data: existingEnrollment } = await supabase
    .from('workshop_enrollment')
    .select('id')
    .eq('semester_id', workshopRow.semester_id)
    .in('profile_id', family.familyProfileIds)
    .limit(1)
    .maybeSingle()

  if (existingEnrollment?.id) {
    return redirectWithEnrollmentMessage('error', 'Your family is already enrolled in one workshop for this semester.')
  }

  const targetProfileId = getFamilyEnrollmentProfileId(family)
  if (!targetProfileId) {
    return redirectWithEnrollmentMessage('error', 'Family enrollment profile not found.')
  }

  const preSurveyForm = await resolveSemesterSurveyForm(workshopRow.semester_id, 'pre_program_survey')

  if (!preSurveyForm.formId) {
    return redirectWithEnrollmentMessage('error', 'Pre-program survey is not configured for this semester.')
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
    return redirectWithEnrollmentMessage('error', 'Please complete the pre-program survey before enrolling.')
  }

  const { data: workshopEnrollments } = await supabase
    .from('workshop_enrollment')
    .select('workshop_id, status')
    .eq('workshop_id', workshop_id)

  const capacitySnapshot = buildWorkshopCapacityMap(
    [
      {
        id: workshop_id,
        capacity: workshopRow.capacity,
        wait_list_capacity: workshopRow.wait_list_capacity,
      },
    ],
    workshopEnrollments ?? []
  ).get(workshop_id)

  if (!capacitySnapshot) {
    return redirectWithEnrollmentMessage('error', 'Unable to evaluate workshop capacity')
  }

  const enrollmentAction = getWorkshopEnrollmentAction(capacitySnapshot)
  if (enrollmentAction === 'full') {
    return redirectWithEnrollmentMessage('error', 'This workshop and its waitlist are full')
  }

  const status = enrollmentAction === 'waitlist' ? 'waitlisted' : 'pending'

  const { data: enrollmentRow, error: enrollmentError } = await supabase
    .from('workshop_enrollment')
    .insert({
      workshop_id,
      profile_id: targetProfileId,
      status,
    })
    .select('id')
    .single()

  if (enrollmentError || !enrollmentRow?.id) {
    return redirectWithEnrollmentMessage('error', enrollmentError?.message ?? 'Unable to create enrollment')
  }

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

  const notificationEventKey = `workshop_enrollment:${enrollmentRow.id}:family_requested:v1`
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
          workshopEnrollmentId: enrollmentRow.id,
        })
      })
    )
      .then(notificationResults => {
        const failedNotifications = notificationResults.filter(result => result.status === 'failed')
        if (failedNotifications.length > 0) {
          console.error('[enroll] failed to send some family enrollment notifications', {
            workshopEnrollmentId: enrollmentRow.id,
            failures: failedNotifications,
          })
        }
      })
      .catch(error => {
        console.error('[enroll] notification dispatch failed', {
          workshopEnrollmentId: enrollmentRow.id,
          error,
        })
      })
  }, 0)

  return redirectWithEnrollmentMessage('success', ENROLLMENT_SUCCESS_MESSAGE)
}

export default function EnrollPage() {
  const { semesters, enrollments, workshopCapacityById, nextClassByWorkshopId, preSurveyBySemester, selectedSemesterId } = useLoaderData<LoaderData>()
  const navigation = useNavigation()
  const mutationLocked =
    navigation.state !== 'idle' &&
    typeof navigation.formMethod === 'string' &&
    navigation.formMethod.toLowerCase() === 'post'

  const semesterId = selectedSemesterId
  const selectedSemester = semesterId ? semesters.find(semester => semester.id === semesterId) : null
  const semesterEnrollment = semesterId ? enrollments.find(enrollment => enrollment.semester_id === semesterId) : null

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
                const status = enrollments.find(enrollment => enrollment.semester_id === semester.id)?.status
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
              <Button asChild variant="outline" size="sm">
                <Link to="/home">Back to Family Workshops</Link>
              </Button>
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
                          <form method="post" className="inline-flex justify-end">
                            <input type="hidden" name="workshop_id" value={workshop.id} />
                            <Button type="submit" disabled={isFull || mutationLocked} size="sm">
                              {isFull ? 'Full' : actionLabel}
                            </Button>
                          </form>
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
