import { useEffect, useMemo, useState } from 'react'
import { Form, useFetcher, useLoaderData, useNavigation } from 'react-router'

import type { Route } from './+types/team.class-management.classes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth.server'

type Cohort = { id: string; name: string }

type ClassRow = {
  id: string
  cohort_id: string | null
  cohort_name: string | null
  starts_at: string
  ends_at: string
  location: string | null
}

type LoaderData = {
  cohorts: Cohort[]
  classes: ClassRow[]
}

type ActionResult = { ok: boolean; error?: string }

function toLocalInput(ts: string) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!['admin', 'manager'].includes(auth.claims.role)) {
    throw new Response('Forbidden', { status: 403, headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)

  const [{ data: cohortRows }, { data: classRows }] = await Promise.all([
    supabase.from('cohort').select('id, name').order('name', { ascending: true }),
    supabase
      .from('class')
      .select('id, cohort_id, starts_at, ends_at, location, cohort:cohort_id ( id, name )')
      .order('starts_at', { ascending: true }),
  ])

  const cohorts: Cohort[] = (cohortRows ?? []).map((c) => ({ id: String(c.id), name: String(c.name) }))
  const classes: ClassRow[] = (classRows ?? []).map((c: any) => ({
    id: String(c.id),
    cohort_id: c.cohort_id ? String(c.cohort_id) : null,
    cohort_name: c.cohort?.name ? String(c.cohort.name) : null,
    starts_at: String(c.starts_at),
    ends_at: String(c.ends_at),
    location: c.location ? String(c.location) : null,
  }))

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))
  merged.set('Content-Type', 'application/json')

  return new Response(JSON.stringify({ cohorts, classes }), { headers: merged })
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const intent = formData.get('intent')

  const cohortRaw = formData.get('cohort_id')
  const cohort_id = cohortRaw ? String(cohortRaw) : null
  const starts_at = String(formData.get('starts_at') ?? '')
  const ends_at = String(formData.get('ends_at') ?? '')
  const location = formData.get('location') ? String(formData.get('location')) : null

  const auth = await requireAuth(request)
  if (!['admin', 'manager'].includes(auth.claims.role)) {
    throw new Response('Forbidden', { status: 403, headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)

  let error: string | null = null

  if (intent === 'create') {
    const { error: insertError } = await supabase.from('class').insert({ cohort_id, starts_at, ends_at, location })
    if (insertError) error = insertError.message
  } else if (intent === 'update') {
    const id = String(formData.get('id') ?? '')
    const { error: updateError } = await supabase.from('class').update({ cohort_id, starts_at, ends_at, location }).eq('id', id)
    if (updateError) error = updateError.message
  } else {
    error = 'Unknown intent'
  }

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))
  merged.set('Content-Type', 'application/json')

  if (error) {
    return new Response(JSON.stringify({ ok: false, error } satisfies ActionResult), {
      status: 400,
      headers: merged,
    })
  }

  return new Response(JSON.stringify({ ok: true } satisfies ActionResult), { status: 200, headers: merged })
}

export default function ClassesPage() {
  const { cohorts, classes } = useLoaderData<LoaderData>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  const createFetcher = useFetcher<ActionResult>()
  const editFetcher = useFetcher<ActionResult>()

  const [editId, setEditId] = useState<string>(classes[0]?.id ?? '')
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const current = useMemo(() => classes.find((c) => c.id === editId), [classes, editId])

  useEffect(() => {
    if (createFetcher.data?.ok) {
      setShowCreate(false)
    }
  }, [createFetcher.data])

  useEffect(() => {
    if (editFetcher.data?.ok) {
      setShowEdit(false)
    }
  }, [editFetcher.data])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Classes</h2>
        <p className="text-sm text-muted-foreground">
          Schedule class sessions with start and end times for each cohort.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between pb-3">
          <div>
            <h3 className="text-lg font-semibold">Classes</h3>
            <p className="text-sm text-muted-foreground">All classes with timing and cohort.</p>
          </div>
          <Button size="sm" variant={showCreate ? 'secondary' : 'default'} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Hide create' : 'Create'}
          </Button>
        </div>
        {showCreate && (
          <div className="mb-4 rounded-md border bg-muted/40 p-4">
            <h4 className="text-sm font-semibold">Create class</h4>
            <createFetcher.Form method="post" className="mt-3 space-y-3">
              <input type="hidden" name="intent" value="create" />
              <div className="space-y-1">
                <Label htmlFor="create-cohort">Cohort</Label>
                <select id="create-cohort" name="cohort_id" className="w-full rounded-md border px-3 py-2 text-sm">
                  <option value="">Unassigned</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="create-starts">Starts at</Label>
                  <Input id="create-starts" type="datetime-local" name="starts_at" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="create-ends">Ends at</Label>
                  <Input id="create-ends" type="datetime-local" name="ends_at" required />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-location">Location</Label>
                <Input id="create-location" name="location" placeholder="Room / Zoom link" />
              </div>
              <Button type="submit" disabled={createFetcher.state === 'submitting'}>
                {createFetcher.state === 'submitting' ? 'Saving…' : 'Create class'}
              </Button>
              {createFetcher.data?.ok ? <p className="text-sm text-emerald-600">Class created.</p> : null}
              {createFetcher.data?.error ? (
                <p className="text-sm text-destructive">{createFetcher.data.error}</p>
              ) : null}
            </createFetcher.Form>
          </div>
        )}
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No classes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Starts</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead>Cohort</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{new Date(c.starts_at).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(c.ends_at).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{c.cohort_name ?? 'Unassigned'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.location ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={editId === c.id ? 'secondary' : 'ghost'}
                        onClick={() => {
                          setEditId(c.id)
                          setShowEdit(true)
                        }}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {showEdit && current ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-muted-foreground">Edit class</p>
                <h3 className="text-lg font-semibold">
                  {current.cohort_name ? `${current.cohort_name} — ` : ''}
                  {new Date(current.starts_at).toLocaleString()}
                </h3>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowEdit(false)} aria-label="Close">
                ×
              </Button>
            </div>

            <editFetcher.Form method="post" className="mt-4 space-y-3">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="id" value={current.id} />
              <div className="space-y-1">
                <Label htmlFor="edit-cohort">Cohort</Label>
                <select
                  id="edit-cohort"
                  name="cohort_id"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  defaultValue={current.cohort_id ?? ''}
                >
                  <option value="">Unassigned</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-starts">Starts at</Label>
                  <Input
                    id="edit-starts"
                    type="datetime-local"
                    name="starts_at"
                    required
                    defaultValue={toLocalInput(current.starts_at)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-ends">Ends at</Label>
                  <Input
                    id="edit-ends"
                    type="datetime-local"
                    name="ends_at"
                    required
                    defaultValue={toLocalInput(current.ends_at)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-location">Location</Label>
                <Input id="edit-location" name="location" defaultValue={current.location ?? ''} placeholder="Room / Zoom link" />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowEdit(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editFetcher.state === 'submitting'}>
                  {editFetcher.state === 'submitting' ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
              {editFetcher.data?.ok ? <p className="text-sm text-emerald-600">Class updated.</p> : null}
              {editFetcher.data?.error ? (
                <p className="text-sm text-destructive">{editFetcher.data.error}</p>
              ) : null}
            </editFetcher.Form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
