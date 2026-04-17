import { Link, useFetcher, useLoaderData } from 'react-router'

import type { Route } from './+types/home'
import { Button } from '@/components/ui/button'
import { adminClient } from '@/lib/supabase/adminClient'
import { enforceOnboardingGuard } from '@/lib/auth.server'
import { resolveFamilyGraph } from '@/lib/family.server'
import { createClient } from '@/lib/supabase/server'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await enforceOnboardingGuard(request)
  const { supabase } = createClient(request)
  const now = new Date().toISOString()

  const family = await resolveFamilyGraph(supabase, auth.user.id)

  const { data: workshops, error: workshopError } = await supabase
    .from('workshop')
    .select('id, description, enrollment_open_at, enrollment_close_at, semester_id')
    .gte('enrollment_close_at', now)
    .order('enrollment_open_at', { ascending: true })
  if (workshopError) {
    throw new Error(workshopError.message)
  }

  const { data: classes } = await supabase
    .from('class')
    .select('workshop_id, starts_at, ends_at')

  const { data: enrollments } = await supabase
    .from('workshop_enrollment')
    .select('workshop_id, status, semester_id, profile_id')
    .in('profile_id', family.familyProfileIds)

  const semesterIds = Array.from(
    new Set((workshops ?? []).map(workshop => workshop.semester_id).filter(Boolean))
  )
  const { data: semesters } = semesterIds.length
    ? await supabase
        .from('semester')
        .select('id, starts_at, ends_at')
        .in('id', semesterIds)
    : { data: [] }

  const targetProfileId =
    family.profileRole === 'guardian'
      ? family.primaryChildByGuardian.get(family.profileId) ?? null
      : family.profileId

  const preSurveyNames = semesterIds.map(semesterId => `Pre-Semester Survey - ${semesterId}`)
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

  const bounds = (classes || []).reduce<Record<string, { start: string; end: string }>>((acc, classRow) => {
    if (!classRow?.workshop_id) return acc
    const current = acc[classRow.workshop_id]
    const start = current?.start ?? classRow.starts_at
    const end = current?.end ?? classRow.ends_at
    acc[classRow.workshop_id] = {
      start: start && start < classRow.starts_at ? start : classRow.starts_at,
      end: end && end > classRow.ends_at ? end : classRow.ends_at,
    }
    return acc
  }, {})

  return {
    user: auth.user,
    role: auth.claims.role,
    now,
    family,
    workshops: (workshops || []).map(workshop => ({
      ...workshop,
      workshop_start: bounds[workshop.id]?.start ?? '',
      workshop_end: bounds[workshop.id]?.end ?? '',
    })),
    semesters: semesters ?? [],
    preSurveyBySemester,
    enrollments: enrollments ?? [],
  }
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createClient(request)
  const formData = await request.formData()
  const workshopId = formData.get('workshopId') as string
  const { data: currentUser } = await supabase.auth.getUser()

  if (!currentUser?.user?.id) {
    return { error: 'Authentication required' }
  }

  const family = await resolveFamilyGraph(supabase, currentUser.user.id)

  const { data: workshopRow, error: workshopError } = await supabase
    .from('workshop')
    .select('id, semester_id')
    .eq('id', workshopId)
    .single()

  if (workshopError || !workshopRow?.semester_id) {
    return { error: workshopError?.message ?? 'Unable to find workshop' }
  }

  const { data: existingEnrollment } = await supabase
    .from('workshop_enrollment')
    .select('id')
    .eq('semester_id', workshopRow.semester_id)
    .in('profile_id', family.familyProfileIds)
    .limit(1)
    .maybeSingle()

  if (existingEnrollment?.id) {
    return { error: 'Family already enrolled for this semester' }
  }

  const primaryChildId = family.primaryChildByGuardian.get(family.profileId)
  if (family.profileRole === 'guardian' && !primaryChildId) {
    return { error: 'Primary child not found for guardian' }
  }

  const targetProfileId = primaryChildId ?? family.profileId

  const preSurveyFormName = `Pre-Semester Survey - ${workshopRow.semester_id}`
  const { data: preSurveyForm } = await adminClient
    .from('form')
    .select('id')
    .eq('name', preSurveyFormName)
    .maybeSingle()

  if (!preSurveyForm?.id) {
    return {
      error: 'Pre-semester survey is not configured for this semester yet.',
    }
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
      error: 'Please complete the pre-semester family survey before enrolling.',
      surveyPath: `/semester-surveys/${workshopRow.semester_id}/pre`,
    }
  }

  const { error } = await supabase.from('workshop_enrollment').upsert(
    {
      workshop_id: workshopId,
      semester_id: workshopRow.semester_id,
      profile_id: targetProfileId,
      status: 'pending',
    },
    { onConflict: 'semester_id,profile_id' }
  )

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

type WorkshopRow = {
  id: string
  description: string
  enrollment_open_at: string
  enrollment_close_at: string
  semester_id: string
  workshop_start: string
  workshop_end: string
}

type LoaderData = {
  user: Awaited<ReturnType<typeof enforceOnboardingGuard>>['user']
  role: string | null
  now: string
  family: Awaited<ReturnType<typeof resolveFamilyGraph>>
  workshops: WorkshopRow[]
  semesters: { id: string; starts_at: string; ends_at: string }[]
  preSurveyBySemester: Record<string, { required: boolean; completed: boolean; preSurveyPath: string | null }>
  enrollments: { workshop_id: string | null; status: string; semester_id: string; profile_id: string | null }[]
}

export default function Home() {
  const { workshops, enrollments, now, family, semesters, preSurveyBySemester } = useLoaderData<LoaderData>()
  const fetcher = useFetcher<typeof action>()
  const statusByWorkshop = new Map<string, string>()
  const enrollmentBySemester = new Map<string, string>()
  const childById = new Map(family.children.map(child => [child.id, child]))
  const semesterById = new Map(semesters.map(semester => [semester.id, semester]))
  const workshopsBySemester = workshops.reduce<Record<string, WorkshopRow[]>>((acc, workshop) => {
    const key = workshop.semester_id
    if (!acc[key]) acc[key] = []
    acc[key].push(workshop)
    return acc
  }, {})

  const semesterSections = Object.entries(workshopsBySemester).sort((a, b) => {
    const first = semesterById.get(a[0])
    const second = semesterById.get(b[0])
    if (!first || !second) return a[0].localeCompare(b[0])
    return first.starts_at.localeCompare(second.starts_at)
  })

  for (const enrollment of enrollments) {
    if (!enrollment.workshop_id) continue
    const current = statusByWorkshop.get(enrollment.workshop_id)
    if (current !== 'approved') {
      statusByWorkshop.set(enrollment.workshop_id, enrollment.status)
    }
    if (enrollment.semester_id && !enrollmentBySemester.has(enrollment.semester_id)) {
      enrollmentBySemester.set(enrollment.semester_id, enrollment.status)
    }
  }

  return (
    <main className="w-full px-6 py-12">
      <header className="mb-4">
        <h1 className="text-3xl font-semibold">Summer Workshops</h1>
        <p className="text-sm text-muted-foreground">Choose a workshop and complete enrollment while the window is open.</p>
      </header>
      <section className="mb-6 rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Family</h2>
        <div className="mt-2 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-slate-900">Guardians</p>
            {family.guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">No guardians linked.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {family.guardians.map(guardian => (
                  <li key={guardian.id}>
                    {guardian.firstname ?? 'Guardian'} {guardian.surname ?? ''}
                    {guardian.primaryChildId && (
                      <span className="text-xs text-muted-foreground">
                        {' '}
                        · Primary child:{' '}
                        {(() => {
                          const child = childById.get(guardian.primaryChildId)
                          if (!child) return 'Assigned'
                          return `${child.firstname ?? 'Child'} ${child.surname ?? ''}`.trim()
                        })()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">Children</p>
            {family.children.length === 0 ? (
              <p className="text-sm text-muted-foreground">No children linked.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {family.children.map(child => (
                  <li key={child.id}>
                    {child.firstname ?? 'Child'} {child.surname ?? ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
      <div className="space-y-8">
        {semesterSections.map(([semesterId, semesterWorkshops]) => {
          const semester = semesterById.get(semesterId)
          const preSurveyStatus = preSurveyBySemester[semesterId]
          const preSurveyComplete = !preSurveyStatus?.required || preSurveyStatus.completed

          return (
            <section key={semesterId} className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Semester {semesterId.slice(0, 8)}</h2>
                  <p className="text-sm text-slate-500">
                    {semester
                      ? `${formatDate(semester.starts_at)} - ${formatDate(semester.ends_at)}`
                      : 'Schedule unavailable'}
                  </p>
                </div>
                {!preSurveyComplete ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 md:max-w-xs">
                    <p className="font-medium">Pre-survey required</p>
                    <p className="mt-1">Complete it before enrolling in this semester.</p>
                    {preSurveyStatus?.preSurveyPath ? (
                      <Button variant="outline" size="sm" className="mt-2" asChild>
                        <Link to={preSurveyStatus.preSurveyPath}>Complete pre-survey</Link>
                      </Button>
                    ) : (
                      <p className="mt-2 text-xs">Survey setup is pending. Please contact staff.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workshop</TableHead>
                    <TableHead>Enrollment starts</TableHead>
                    <TableHead>Enrollment ends</TableHead>
                    <TableHead>Workshop starts</TableHead>
                    <TableHead>Workshop ends</TableHead>
                    <TableHead>Enroll</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {semesterWorkshops.map(workshop => {
                    const enrollmentStatus = statusByWorkshop.get(workshop.id)
                    const isOpen = now >= workshop.enrollment_open_at && now <= workshop.enrollment_close_at
                    const semesterStatus = enrollmentBySemester.get(workshop.semester_id)
                    const familyEnrolledThisSemester = Boolean(semesterStatus)
                    const disabled =
                      !preSurveyComplete ||
                      !isOpen ||
                      enrollmentStatus === 'pending' ||
                      enrollmentStatus === 'approved' ||
                      familyEnrolledThisSemester

                    return (
                      <TableRow key={workshop.id}>
                        <TableCell>
                          <p className="font-medium text-slate-900">{workshop.description}</p>
                        </TableCell>
                        <TableCell>{formatDate(workshop.enrollment_open_at)}</TableCell>
                        <TableCell>{formatDate(workshop.enrollment_close_at)}</TableCell>
                        <TableCell>{workshop.workshop_start ? formatDate(workshop.workshop_start) : 'TBD'}</TableCell>
                        <TableCell>{workshop.workshop_end ? formatDate(workshop.workshop_end) : 'TBD'}</TableCell>
                        <TableCell>
                          <fetcher.Form method="post" className="flex flex-col gap-1">
                            <input type="hidden" name="workshopId" value={workshop.id} />
                            <Button
                              type="submit"
                              variant={disabled ? 'ghost' : 'default'}
                              size="sm"
                              disabled={disabled}
                            >
                              {enrollmentStatus === 'approved'
                                ? 'Enrolled'
                                : enrollmentStatus === 'pending'
                                ? 'Pending'
                                : familyEnrolledThisSemester
                                ? 'Already Enrolled'
                                : !preSurveyComplete
                                ? 'Complete Pre-Survey'
                                : isOpen
                                ? 'Enroll'
                                : 'Closed'}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                              {familyEnrolledThisSemester
                                ? 'Family already enrolled this semester'
                                : !preSurveyComplete
                                ? 'Pre-semester family survey required'
                                : `Status: ${enrollmentStatus ?? 'not enrolled'}`}
                            </p>
                          </fetcher.Form>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </section>
          )
        })}
      </div>
      {fetcher.data?.error ? (
        <div className="pt-3">
          <p className="text-sm text-destructive">{fetcher.data.error}</p>
          {fetcher.data.surveyPath ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={fetcher.data.surveyPath}>Complete pre-semester survey</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </main>
  )
}
