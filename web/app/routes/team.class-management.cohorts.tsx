import { useMemo, useState } from 'react'
import { Form, useLoaderData, useNavigation } from 'react-router'

import type { Route } from './+types/team.class-management.cohorts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth.server'

type Semester = {
  id: string
  name: string
}

type Cohort = {
  id: string
  name: string
  semester_id: string | null
  semester_name: string | null
}

type LoaderData = {
  semesters: Semester[]
  cohorts: Cohort[]
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!['admin', 'manager'].includes(auth.claims.role)) {
    throw new Response('Forbidden', { status: 403, headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)

  const [{ data: semesterRows }, { data: cohortRows }] = await Promise.all([
    supabase.from('semester').select('id, name').order('starts_at', { ascending: true }),
    supabase
      .from('cohort')
      .select('id, name, semester_id, semester:semester_id ( id, name )')
      .order('created_at', { ascending: true }),
  ])

  const semesters: Semester[] = (semesterRows ?? []).map((s) => ({ id: String(s.id), name: String(s.name) }))
  const cohorts: Cohort[] = (cohortRows ?? []).map((c: any) => ({
    id: String(c.id),
    name: String(c.name),
    semester_id: c.semester_id ? String(c.semester_id) : null,
    semester_name: c.semester?.name ? String(c.semester.name) : null,
  }))

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))
  merged.set('Content-Type', 'application/json')

  return new Response(JSON.stringify({ semesters, cohorts }), { headers: merged })
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const intent = formData.get('intent')

  const name = String(formData.get('name') ?? '')
  const semesterRaw = formData.get('semester_id')
  const semester_id = semesterRaw ? String(semesterRaw) : null

  const auth = await requireAuth(request)
  if (!['admin', 'manager'].includes(auth.claims.role)) {
    throw new Response('Forbidden', { status: 403, headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)

  if (intent === 'create') {
    await supabase.from('cohort').insert({ name, semester_id })
  } else if (intent === 'update') {
    const id = String(formData.get('id') ?? '')
    await supabase.from('cohort').update({ name, semester_id }).eq('id', id)
  }

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))

  return new Response(null, { status: 204, headers: merged })
}

export default function CohortsPage() {
  const { semesters, cohorts } = useLoaderData<LoaderData>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  const [editId, setEditId] = useState<string>(cohorts[0]?.id ?? '')
  const current = useMemo(() => cohorts.find((c) => c.id === editId), [cohorts, editId])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Cohorts</h2>
        <p className="text-sm text-muted-foreground">
          Group students within semesters and handle approvals.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Create cohort</h3>
          <Form method="post" className="mt-3 space-y-3">
            <input type="hidden" name="intent" value="create" />
            <div className="space-y-1">
              <Label htmlFor="create-name">Name</Label>
              <Input id="create-name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-semester">Semester</Label>
              <select id="create-semester" name="semester_id" className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Create cohort'}
            </Button>
          </Form>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Edit cohort</h3>
          {cohorts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cohorts yet.</p>
          ) : (
            <Form method="post" className="mt-3 space-y-3">
              <input type="hidden" name="intent" value="update" />
              <div className="space-y-1">
                <Label htmlFor="edit-select">Select cohort</Label>
                <select
                  id="edit-select"
                  name="id"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={editId}
                  onChange={(e) => setEditId(e.target.value)}
                >
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" name="name" required defaultValue={current?.name ?? ''} key={current?.id ?? 'name'} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-semester">Semester</Label>
                <select
                  id="edit-semester"
                  name="semester_id"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  defaultValue={current?.semester_id ?? ''}
                  key={`${current?.id ?? 'sem'}-select`}
                >
                  <option value="">Unassigned</option>
                  {semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save changes'}
              </Button>
            </Form>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between pb-3">
          <div>
            <h3 className="text-lg font-semibold">Cohorts</h3>
            <p className="text-sm text-muted-foreground">All cohorts with their semester.</p>
          </div>
        </div>
        {cohorts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cohorts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Semester</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.semester_name ?? 'Unassigned'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
