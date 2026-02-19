import { useLoaderData } from 'react-router'

import type { Route } from './+types/team.forms'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth.server'

type FormRow = {
  id: string
  name: string
  due_at: string | null
  is_required: boolean
}

type LoaderData = {
  forms: FormRow[]
  error?: string
  role: string
  permissions: string[]
  canReadForms: boolean
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!['admin', 'manager'].includes(auth.claims.role)) {
    throw new Response('Forbidden', { status: 403, headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)
  const { data, error } = await supabase
    .from('form')
    .select('id, name, due_at, is_required')
    .order('created_at', { ascending: false })

  const merged = new Headers(headers)
  auth.headers.forEach((value, key) => merged.set(key, value))
  merged.set('Content-Type', 'application/json')

  if (error) {
    console.error('[team.forms] supabase form read failed', error.message)
    return new Response(
      JSON.stringify({ forms: [], error: error.message, role: auth.claims.role, permissions: auth.claims.permissions, canReadForms: false }),
      { status: 500, headers: merged }
    )
  }

  return new Response(
    JSON.stringify({
      forms: (data ?? []).map((f) => ({ ...f, id: String(f.id) })) satisfies FormRow[],
      role: auth.claims.role,
      permissions: auth.claims.permissions,
      canReadForms: auth.claims.permissions.includes('form.read'),
    }),
    { headers: merged }
  )
}

export default function TeamFormsPage() {
  const { forms, error, role, permissions, canReadForms } = useLoaderData<LoaderData>()

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Forms</p>
        <h1 className="text-2xl font-semibold leading-tight">Form library</h1>
        <p className="text-muted-foreground">All forms available to assign and manage.</p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Role: <span className="font-medium text-foreground">{role}</span> · canReadForms: {canReadForms ? 'yes' : 'no'} · perms: {permissions.join(', ') || 'none'}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No forms yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Due date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-muted-foreground">{f.is_required ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {f.due_at ? new Date(f.due_at).toLocaleDateString() : 'No due date'}
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
