import { useLoaderData, useFetcher } from 'react-router'

import type { Route } from './+types/enroll'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth.server'

type CohortRow = {
  id: string
  name: string
  semester_name: string | null
}

type EnrollmentRow = {
  id: string
  cohort_id: string
  status: string
}

type LoaderData = {
  cohorts: CohortRow[]
  enrollments: EnrollmentRow[]
}

type ActionResult = { ok: boolean; error?: string }

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)

  const { supabase, headers } = createClient(request)

  const [{ data: cohortsData }, { data: enrollmentsData }] = await Promise.all([
    supabase
      .from('cohort')
      .select('id, name, semester:semester_id ( name )')
      .order('created_at', { ascending: true }),
    supabase
      .from('cohort_enrollment')
      .select('id, cohort_id, status')
      .eq('user_id', auth.user.id)
      .order('requested_at', { ascending: false }),
  ])

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))
  merged.set('Content-Type', 'application/json')

  const cohorts: CohortRow[] = (cohortsData ?? []).map((c: any) => ({
    id: String(c.id),
    name: String(c.name),
    semester_name: c.semester?.name ? String(c.semester.name) : null,
  }))

  const enrollments: EnrollmentRow[] = (enrollmentsData ?? []).map((e: any) => ({
    id: String(e.id),
    cohort_id: String(e.cohort_id),
    status: String(e.status),
  }))

  return new Response(JSON.stringify({ cohorts, enrollments }), { headers: merged })
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const cohort_id = String(formData.get('cohort_id') ?? '')

  const auth = await requireAuth(request)

  const { supabase, headers } = createClient(request)
  const { error } = await supabase.from('cohort_enrollment').insert({ cohort_id, user_id: auth.user.id, status: 'pending' })

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
  const { cohorts, enrollments } = useLoaderData<LoaderData>()
  const fetcher = useFetcher<ActionResult>()

  const enrollmentByCohort = new Map(enrollments.map((e) => [e.cohort_id, e]))

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Enroll in a cohort</h1>
        <p className="text-muted-foreground text-sm">Choose a cohort to request enrollment. Requests go to admins for approval.</p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        {cohorts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cohorts available.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort</TableHead>
                  <TableHead>Semester</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.map((c) => {
                  const existing = enrollmentByCohort.get(c.id)
                  const status = existing?.status
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.semester_name ?? 'Unassigned'}</TableCell>
                      <TableCell className="text-right">
                        {status ? (
                          <span className="text-sm capitalize text-muted-foreground">{status}</span>
                        ) : (
                          <fetcher.Form method="post" className="inline-flex justify-end">
                            <input type="hidden" name="cohort_id" value={c.id} />
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
        {fetcher.data?.error ? <p className="pt-3 text-sm text-destructive">{fetcher.data.error}</p> : null}
        {fetcher.data?.ok ? <p className="pt-3 text-sm text-emerald-600">Enrollment requested.</p> : null}
      </div>
    </main>
  )
}
