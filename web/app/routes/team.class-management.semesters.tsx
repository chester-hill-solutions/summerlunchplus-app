import { useMemo, useState } from 'react'
import { Form, useLoaderData, useNavigation } from 'react-router'

import type { Route } from './+types/team.class-management.semesters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth.server'

type Semester = {
  id: string
  name: string
  starts_at: string
  ends_at: string
}

type LoaderData = {
  semesters: Semester[]
}

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
  const { data } = await supabase.from('semester').select('id, name, starts_at, ends_at').order('starts_at', {
    ascending: true,
  })

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))
  merged.set('Content-Type', 'application/json')

  return new Response(
    JSON.stringify({ semesters: (data ?? []).map((s) => ({ ...s, id: String(s.id) })) satisfies Semester[] }),
    {
      headers: merged,
    }
  )
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const intent = formData.get('intent')

  const name = String(formData.get('name') ?? '')
  const starts_at = String(formData.get('starts_at') ?? '')
  const ends_at = String(formData.get('ends_at') ?? '')

   const auth = await requireAuth(request)
   if (!['admin', 'manager'].includes(auth.claims.role)) {
     throw new Response('Forbidden', { status: 403, headers: auth.headers })
   }

  const { supabase, headers } = createClient(request)

  if (intent === 'create') {
    await supabase.from('semester').insert({ name, starts_at, ends_at })
  } else if (intent === 'update') {
    const id = String(formData.get('id') ?? '')
    await supabase.from('semester').update({ name, starts_at, ends_at }).eq('id', id)
  }

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))

  return new Response(null, { status: 204, headers: merged })
}

export default function SemestersPage() {
  const { semesters } = useLoaderData<LoaderData>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  const [editId, setEditId] = useState<string>(semesters[0]?.id ?? '')
  const current = useMemo(() => semesters.find((s) => s.id === editId), [editId, semesters])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Semesters</h2>
        <p className="text-sm text-muted-foreground">
          Define term start and end dates. Names and month ranges must stay unique.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Create semester</h3>
          <Form method="post" className="mt-3 space-y-3">
            <input type="hidden" name="intent" value="create" />
            <div className="space-y-1">
              <Label htmlFor="create-name">Name</Label>
              <Input id="create-name" name="name" required />
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Create semester'}
            </Button>
          </Form>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Edit semester</h3>
          {semesters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No semesters yet.</p>
          ) : (
            <Form method="post" className="mt-3 space-y-3">
              <input type="hidden" name="intent" value="update" />
              <div className="space-y-1">
                <Label htmlFor="edit-select">Select semester</Label>
                <select
                  id="edit-select"
                  name="id"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={editId}
                  onChange={(e) => setEditId(e.target.value)}
                >
                  {semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" name="name" required defaultValue={current?.name ?? ''} key={current?.id ?? 'name'} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-starts">Starts at</Label>
                  <Input
                    id="edit-starts"
                    type="datetime-local"
                    name="starts_at"
                    required
                    defaultValue={current ? toLocalInput(current.starts_at) : ''}
                    key={`${current?.id ?? 'start'}-starts`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-ends">Ends at</Label>
                  <Input
                    id="edit-ends"
                    type="datetime-local"
                    name="ends_at"
                    required
                    defaultValue={current ? toLocalInput(current.ends_at) : ''}
                    key={`${current?.id ?? 'end'}-ends`}
                  />
                </div>
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
            <h3 className="text-lg font-semibold">Semesters</h3>
            <p className="text-sm text-muted-foreground">All semesters in the system.</p>
          </div>
        </div>
        {semesters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No semesters yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Ends</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {semesters.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(s.starts_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(s.ends_at).toLocaleString()}
                    </TableCell>
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
