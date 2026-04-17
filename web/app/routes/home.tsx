import { useFetcher, useLoaderData } from 'react-router'

import type { Route } from './+types/home'
import { Button } from '@/components/ui/button'
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
  enrollments: { workshop_id: string | null; status: string; semester_id: string; profile_id: string | null }[]
}

export default function Home() {
  const { workshops, enrollments, now, family } = useLoaderData<LoaderData>()
  const fetcher = useFetcher<typeof action>()
  const statusByWorkshop = new Map<string, string>()
  const enrollmentBySemester = new Map<string, string>()
  const childById = new Map(family.children.map(child => [child.id, child]))

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
          {workshops.map(workshop => {
            const enrollmentStatus = statusByWorkshop.get(workshop.id)
            const isOpen = now >= workshop.enrollment_open_at && now <= workshop.enrollment_close_at
            const semesterStatus = enrollmentBySemester.get(workshop.semester_id)
            const familyEnrolledThisSemester = Boolean(semesterStatus)
            const disabled =
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
                    <Button type="submit" variant={disabled ? 'ghost' : 'default'} size="sm" disabled={disabled}>
                      {enrollmentStatus === 'approved'
                        ? 'Enrolled'
                        : enrollmentStatus === 'pending'
                        ? 'Pending'
                        : familyEnrolledThisSemester
                        ? 'Family enrolled'
                        : isOpen
                        ? 'Enroll'
                        : 'Closed'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {familyEnrolledThisSemester
                        ? 'Family already enrolled this semester'
                        : `Status: ${enrollmentStatus ?? 'not enrolled'}`}
                    </p>
                  </fetcher.Form>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {fetcher.data?.error ? (
        <p className="pt-3 text-sm text-destructive">{fetcher.data.error}</p>
      ) : null}
    </main>
  )
}
