import { Link, redirect, useActionData, useLoaderData, useSearchParams } from 'react-router'

import type { Route } from './+types/enroll'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminClient } from '@/lib/supabase/adminClient'
import { requireAuth } from '@/lib/auth.server'
import { resolveFamilyGraph } from '@/lib/family.server'
import {
  buildWorkshopCapacityMap,
  getWorkshopEnrollmentAction,
  type WorkshopCapacitySnapshot,
} from '@/lib/workshop-capacity'
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
  preSurveyBySemester: Record<string, { required: boolean; completed: boolean; preSurveyPath: string | null }>
  selectedSemesterId: string | null
}

type ActionData = {
  ok?: boolean
  error?: string
  status?: 'pending' | 'waitlisted'
  surveyPath?: string | null
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

const getFamilyEnrollmentProfileId = (family: Awaited<ReturnType<typeof resolveFamilyGraph>>) => {
  if (family.profileRole === 'guardian') {
    return family.primaryChildByGuardian.get(family.profileId) ?? null
  }
  return family.profileId
}

const getPreSurveyFormName = (semesterId: string) => `Pre-Semester Survey - ${semesterId}`

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
  const selectedSemesterId = url.searchParams.get('semester')

  const [{ data: semesterData }, { data: enrollmentsData }] = await Promise.all([
    supabase
      .from('semester')
      .select('id, starts_at, ends_at, enrollment_open_at, enrollment_close_at, workshop (id, description, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity)')
      .order('starts_at', { ascending: true }),
    supabase
      .from('workshop_enrollment')
      .select('id, workshop_id, semester_id, profile_id, status')
      .in('profile_id', family.familyProfileIds)
      .order('requested_at', { ascending: false }),
  ])

  const semesters: SemesterRow[] = (semesterData ?? []).map((s: any) => ({
    id: String(s.id),
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

  const workshops = semesters.flatMap(semester => semester.workshops)
  const workshopIds = workshops.map(workshop => workshop.id)
  const { data: workshopEnrollmentRows } = workshopIds.length
    ? await supabase
        .from('workshop_enrollment')
        .select('workshop_id, status')
        .in('workshop_id', workshopIds)
    : { data: [] }

  const workshopCapacityById = Object.fromEntries(
    Array.from(
      buildWorkshopCapacityMap(workshops, workshopEnrollmentRows ?? []).entries(),
      ([workshopId, snapshot]) => [workshopId, snapshot]
    )
  )

  const targetProfileId = getFamilyEnrollmentProfileId(family)
  const semesterIds = semesters.map(semester => semester.id)
  const preSurveyNames = semesterIds.map(semesterId => getPreSurveyFormName(semesterId))
  const { data: preSurveyForms } = preSurveyNames.length
    ? await adminClient.from('form').select('id, name').in('name', preSurveyNames)
    : { data: [] }

  const preSurveyFormBySemester = new Map<string, string>()
  for (const row of preSurveyForms ?? []) {
    const semesterId = row.name.replace('Pre-Semester Survey - ', '')
    preSurveyFormBySemester.set(semesterId, row.id)
  }

  const preSurveyFormIds = Array.from(preSurveyFormBySemester.values())
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
      const formId = preSurveyFormBySemester.get(semesterId)
      return [
        semesterId,
        {
          required: true,
          completed: Boolean(formId && completedPreSurveyFormIds.has(formId)),
          preSurveyPath: formId ? `/semester-surveys/${semesterId}/pre` : null,
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
    return { ok: false, error: message } satisfies ActionData
  }

  const { data: workshopRow, error: workshopError } = await supabase
    .from('workshop')
    .select('id, semester_id, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity')
    .eq('id', workshop_id)
    .single()

  if (workshopError || !workshopRow?.semester_id) {
    return { ok: false, error: 'Workshop not found' } satisfies ActionData
  }

  const nowIso = new Date().toISOString()
  const enrollmentOpenAt = workshopRow.enrollment_open_at
  const enrollmentCloseAt = workshopRow.enrollment_close_at
  const isOpen = (!enrollmentOpenAt || nowIso >= enrollmentOpenAt) && (!enrollmentCloseAt || nowIso <= enrollmentCloseAt)
  if (!isOpen) {
    return { ok: false, error: 'Enrollment is closed for this workshop' } satisfies ActionData
  }

  const { data: existingEnrollment } = await supabase
    .from('workshop_enrollment')
    .select('id')
    .eq('semester_id', workshopRow.semester_id)
    .in('profile_id', family.familyProfileIds)
    .limit(1)
    .maybeSingle()

  if (existingEnrollment?.id) {
    return { ok: false, error: 'Your family is already enrolled in one workshop for this semester.' } satisfies ActionData
  }

  const targetProfileId = getFamilyEnrollmentProfileId(family)
  if (!targetProfileId) {
    return { ok: false, error: 'Family enrollment profile not found.' } satisfies ActionData
  }

  const preSurveyFormName = getPreSurveyFormName(workshopRow.semester_id)
  const { data: preSurveyForm } = await adminClient
    .from('form')
    .select('id')
    .eq('name', preSurveyFormName)
    .maybeSingle()

  if (!preSurveyForm?.id) {
    return { ok: false, error: 'Pre-semester survey is not configured for this semester.' } satisfies ActionData
  }

  const { data: preSurveySubmission } = await adminClient
    .from('form_submission')
    .select('id')
    .eq('form_id', preSurveyForm.id)
    .eq('profile_id', targetProfileId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!preSurveySubmission?.id) {
    return {
      ok: false,
      error: 'Please complete the pre-semester survey before enrolling.',
      surveyPath: `/semester-surveys/${workshopRow.semester_id}/pre`,
    } satisfies ActionData
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
    return { ok: false, error: 'Unable to evaluate workshop capacity' } satisfies ActionData
  }

  const enrollmentAction = getWorkshopEnrollmentAction(capacitySnapshot)
  if (enrollmentAction === 'full') {
    return { ok: false, error: 'This workshop and its waitlist are full' } satisfies ActionData
  }

  const status: ActionData['status'] = enrollmentAction === 'waitlist' ? 'waitlisted' : 'pending'

  const { error } = await supabase.from('workshop_enrollment').insert({
    workshop_id,
    profile_id: targetProfileId,
    status,
  })

  if (error) {
    return { ok: false, error: error.message } satisfies ActionData
  }

  return { ok: true, status } satisfies ActionData
}

export default function EnrollPage() {
  const { semesters, enrollments, workshopCapacityById, preSurveyBySemester, selectedSemesterId } = useLoaderData<LoaderData>()
  const actionData = useActionData<ActionData>()
  const [searchParams] = useSearchParams()

  const semesterId = selectedSemesterId ?? searchParams.get('semester')
  const selectedSemester = semesterId ? semesters.find(semester => semester.id === semesterId) : null
  const semesterEnrollment = semesterId ? enrollments.find(enrollment => enrollment.semester_id === semesterId) : null

  return (
    <main className="flex w-full flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Enroll in a workshop</h1>
        <p className="text-sm text-muted-foreground">Step 1: select a semester. Step 2: complete pre-survey. Step 3: choose one workshop.</p>
      </div>

      {!selectedSemester ? (
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semester</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Pre-survey</TableHead>
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
                    <TableCell>{formatDate(semester.starts_at)} - {formatDate(semester.ends_at)}</TableCell>
                    <TableCell>{preSurvey?.completed ? 'Complete' : 'Required'}</TableCell>
                    <TableCell className="capitalize">{status ?? 'Not enrolled'}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/enroll?semester=${semester.id}`}>Select semester</Link>
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
            <h2 className="text-lg font-semibold">Semester {selectedSemester.id.slice(0, 8)}</h2>
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
          ) : !preSurveyBySemester[selectedSemester.id]?.completed ? (
            <div className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
              <p className="font-medium">Complete pre-survey before choosing a workshop.</p>
              {preSurveyBySemester[selectedSemester.id]?.preSurveyPath ? (
                <Button asChild>
                  <Link to={preSurveyBySemester[selectedSemester.id].preSurveyPath as string}>Complete pre-survey</Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Pre-survey is not configured yet for this semester.</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
              <p className="text-sm text-muted-foreground">You can enroll in one workshop for this semester.</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workshop</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead>Waitlist</TableHead>
                    <TableHead>Enrollment window</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedSemester.workshops.map(workshop => {
                    const capacitySnapshot = workshopCapacityById[workshop.id]
                    const enrollmentAction = capacitySnapshot
                      ? getWorkshopEnrollmentAction(capacitySnapshot)
                      : 'enroll'
                    const isFull = enrollmentAction === 'full'
                    const actionLabel = enrollmentAction === 'waitlist' ? 'Join waitlist' : 'Request enrollment'

                    return (
                      <TableRow key={workshop.id}>
                        <TableCell className="font-medium">{workshop.description ?? 'Workshop'}</TableCell>
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
                            <Button type="submit" disabled={isFull} size="sm">
                              {isFull ? 'Full' : actionLabel}
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {actionData?.error ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{actionData.error}</p>
          {actionData.surveyPath ? (
            <Button asChild variant="outline" size="sm">
              <Link to={actionData.surveyPath}>Complete pre-survey</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {actionData?.ok ? (
        <p className="text-sm text-emerald-600">
          {actionData.status === 'waitlisted' ? 'Added to waitlist.' : 'Enrollment requested.'}
        </p>
      ) : null}
    </main>
  )
}
