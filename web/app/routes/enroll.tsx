import { useLoaderData, useFetcher } from 'react-router'

import type { Route } from './+types/enroll'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth.server'

type WorkshopRow = {
  id: string
  description: string | null
  enrollment_open_at: string | null
  enrollment_close_at: string | null
  capacity: number
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
  status: string
}

type LoaderData = {
  semesters: SemesterRow[]
  enrollments: EnrollmentRow[]
}

type ActionResult = { ok: boolean; error?: string }

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const { supabase, headers } = createClient(request)

  const { data: profile } = await supabase
    .from('profile')
    .select('id')
    .eq('user_id', auth.user.id)
    .single()

  if (!profile?.id) {
    throw new Response('Profile not found', { status: 404 })
  }

  const [{ data: semesterData }, { data: enrollmentsData }] = await Promise.all([
    supabase
      .from('semester')
      .select('id, starts_at, ends_at, enrollment_open_at, enrollment_close_at, workshop (id, description, enrollment_open_at, enrollment_close_at, capacity)')
      .order('starts_at', { ascending: true }),
    supabase
      .from('workshop_enrollment')
      .select('id, workshop_id, semester_id, status')
      .eq('profile_id', profile.id)
      .order('requested_at', { ascending: false }),
  ])

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))
  merged.set('Content-Type', 'application/json')

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
    })),
  }))

  const enrollments: EnrollmentRow[] = (enrollmentsData ?? []).map((e: any) => ({
    id: String(e.id),
    workshop_id: String(e.workshop_id),
    semester_id: String(e.semester_id),
    status: String(e.status),
  }))

  return new Response(JSON.stringify({ semesters, enrollments }), { headers: merged })
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const workshop_id = String(formData.get('workshop_id') ?? '')

  const auth = await requireAuth(request)
  const { supabase, headers } = createClient(request)

  const { data: profile } = await supabase
    .from('profile')
    .select('id')
    .eq('user_id', auth.user.id)
    .single()

  if (!profile?.id) {
    return new Response(JSON.stringify({ ok: false, error: 'Profile not found' } satisfies ActionResult), {
      status: 404,
      headers,
    })
  }

  const { error } = await supabase.from('workshop_enrollment').insert({
    workshop_id,
    profile_id: profile.id,
    status: 'pending',
  })

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))
  merged.set('Content-Type', 'application/json')

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message } satisfies ActionResult), {
      status: 400,
      headers: merged,
    })
  }

  return new Response(JSON.stringify({ ok: true } satisfies ActionResult), { headers: merged })
}

export default function EnrollPage() {
  const { semesters, enrollments } = useLoaderData<LoaderData>()
  const fetcher = useFetcher<ActionResult>()

  const enrollmentBySemester = new Map(enrollments.map((e) => [e.semester_id, e]))

  return (
    <main className="flex w-full flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Enroll in a workshop</h1>
        <p className="text-muted-foreground text-sm">
          Choose one workshop per semester for your family. Requests go to admins for approval.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {semesters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No semesters available.</p>
        ) : (
          semesters.map((semester) => {
            const existing = enrollmentBySemester.get(semester.id)
            return (
              <div key={semester.id} className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">Semester starting {new Date(semester.starts_at).toLocaleDateString()}</h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(semester.starts_at).toLocaleDateString()} – {new Date(semester.ends_at).toLocaleDateString()}
                  </p>
                </div>
                {semester.workshops.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No workshops available.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Workshop</TableHead>
                          <TableHead>Enrollment window</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {semester.workshops.map((workshop) => {
                          const status = existing?.status
                          return (
                            <TableRow key={workshop.id}>
                              <TableCell className="font-medium">{workshop.description ?? 'Workshop'}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {workshop.enrollment_open_at
                                  ? new Date(workshop.enrollment_open_at).toLocaleDateString()
                                  : 'Open'}{' '}
                                –{' '}
                                {workshop.enrollment_close_at
                                  ? new Date(workshop.enrollment_close_at).toLocaleDateString()
                                  : 'Close'}
                              </TableCell>
                              <TableCell className="text-right">
                                {status ? (
                                  <span className="text-sm capitalize text-muted-foreground">{status}</span>
                                ) : (
                                  <fetcher.Form method="post" className="inline-flex justify-end">
                                    <input type="hidden" name="workshop_id" value={workshop.id} />
                                    <Button type="submit" disabled={fetcher.state === 'submitting'}>
                                      {fetcher.state === 'submitting' ? 'Submitting…' : 'Request enrollment'}
                                    </Button>
                                  </fetcher.Form>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )
          })
        )}
        {fetcher.data?.error ? <p className="pt-3 text-sm text-destructive">{fetcher.data.error}</p> : null}
        {fetcher.data?.ok ? <p className="pt-3 text-sm text-emerald-600">Enrollment requested.</p> : null}
      </div>
    </main>
  )
}
