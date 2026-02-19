import { useFetcher, useLoaderData } from 'react-router'

import type { Route } from './+types/team.class-management.enrollments'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth.server'

type Enrollment = {
  id: string
  cohort_name: string | null
  user_id: string | null
  status: string
  requested_at: string
}

type LoaderData = { enrollments: Enrollment[] }
type ActionResult = { ok: boolean; error?: string }

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!['admin', 'manager'].includes(auth.claims.role)) {
    throw new Response('Forbidden', { status: 403, headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)
  const { data } = await supabase
    .from('cohort_enrollment')
    .select('id, user_id, status, requested_at, cohort:cohort_id ( name )')
    .order('requested_at', { ascending: false })

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))
  merged.set('Content-Type', 'application/json')

  const enrollments: Enrollment[] = (data ?? []).map((row: any) => ({
    id: String(row.id),
    user_id: row.user_id ? String(row.user_id) : null,
    status: String(row.status),
    cohort_name: row.cohort?.name ? String(row.cohort.name) : null,
    requested_at: row.requested_at ?? '',
  }))

  return new Response(JSON.stringify({ enrollments }), { headers: merged })
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')

  const auth = await requireAuth(request)
  if (!['admin', 'manager'].includes(auth.claims.role)) {
    throw new Response('Forbidden', { status: 403, headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)
  const { error } = await supabase.from('cohort_enrollment').update({ status }).eq('id', id)

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

export default function EnrollmentsPage() {
  const { enrollments } = useLoaderData<LoaderData>()
  const fetcher = useFetcher<ActionResult>()

  const act = (id: string, status: string) => {
    const fd = new FormData()
    fd.set('id', id)
    fd.set('status', status)
    fetcher.submit(fd, { method: 'post' })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Enrollments</p>
        <h1 className="text-2xl font-semibold leading-tight">Cohort enrollment approvals</h1>
        <p className="text-muted-foreground">Approve or reject cohort enrollment requests.</p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enrollment requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.cohort_name ?? 'Unknown'}</TableCell>
                    <TableCell className="text-muted-foreground">{e.user_id ?? 'Unknown'}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{e.status}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.requested_at ? new Date(e.requested_at).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act(e.id, 'approved')}
                        disabled={fetcher.state === 'submitting'}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => act(e.id, 'rejected')}
                        disabled={fetcher.state === 'submitting'}
                      >
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {fetcher.data?.error ? <p className="pt-3 text-sm text-destructive">{fetcher.data.error}</p> : null}
        {fetcher.data?.ok ? <p className="pt-3 text-sm text-emerald-600">Status updated.</p> : null}
      </div>
    </div>
  )
}
