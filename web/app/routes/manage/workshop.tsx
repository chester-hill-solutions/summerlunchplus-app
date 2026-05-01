import { useFetcher, useLoaderData } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { buildWorkshopCapacityMap } from '@/lib/workshop-capacity'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/workshop'

type WorkshopRow = {
  id: string
  description: string | null
  semester_id: string
  enrollment_open_at: string | null
  enrollment_close_at: string | null
  capacity: number
  wait_list_capacity: number
  semester: {
    starts_at: string
    ends_at: string
  } | null
}

type LoaderData = {
  workshops: Array<
    WorkshopRow & {
      approvedCount: number
      waitlistedCount: number
    }
  >
  canEdit: boolean
}

type ActionData = {
  error?: string
  success?: string
}

const parseLimit = (value: FormDataEntryValue | null) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const { supabase } = createClient(request)

  const { data: workshops, error: workshopError } = await supabase
    .from('workshop')
    .select('id, description, semester_id, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity, semester:semester_id ( starts_at, ends_at )')
    .order('enrollment_open_at', { ascending: true })

  if (workshopError) {
    throw new Response(workshopError.message, { status: 500, headers: auth.headers })
  }

  const workshopRows = ((workshops ?? []) as unknown as WorkshopRow[]).map(workshop => ({
    ...workshop,
    semester: Array.isArray(workshop.semester) ? workshop.semester[0] ?? null : workshop.semester,
  }))

  const workshopIds = workshopRows.map(workshop => workshop.id)
  const { data: enrollments } = workshopIds.length
    ? await supabase
        .from('workshop_enrollment')
        .select('workshop_id, status')
        .in('workshop_id', workshopIds)
    : { data: [] }

  const capacityByWorkshop = buildWorkshopCapacityMap(workshopRows, enrollments ?? [])

  return {
    workshops: workshopRows.map(workshop => {
      const snapshot = capacityByWorkshop.get(workshop.id)
      return {
        ...workshop,
        approvedCount: snapshot?.approvedCount ?? 0,
        waitlistedCount: snapshot?.waitlistedCount ?? 0,
      }
    }),
    canEdit: isRoleAtLeast(auth.claims.role, 'staff'),
  } satisfies LoaderData
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  if (formData.get('intent') !== 'update-limits') {
    return { error: 'Unsupported action' } satisfies ActionData
  }

  const workshopId = String(formData.get('workshop_id') ?? '')
  const capacity = parseLimit(formData.get('capacity'))
  const waitListCapacity = parseLimit(formData.get('wait_list_capacity'))

  if (!workshopId || capacity === null || waitListCapacity === null) {
    return { error: 'Capacity and waitlist must be non-negative whole numbers.' } satisfies ActionData
  }

  const { supabase } = createClient(request)
  const { error } = await supabase
    .from('workshop')
    .update({ capacity, wait_list_capacity: waitListCapacity })
    .eq('id', workshopId)

  if (error) {
    return { error: error.message } satisfies ActionData
  }

  return { success: 'Workshop limits updated.' } satisfies ActionData
}

export default function WorkshopTablePage() {
  const { workshops, canEdit } = useLoaderData<LoaderData>()
  const fetcher = useFetcher<ActionData>()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Workshops</h1>
        <p className="text-sm text-muted-foreground">Manage enrollment seat and waitlist targets for each workshop.</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full table-auto text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Semester</th>
              <th className="px-4 py-2 text-left">Workshop</th>
              <th className="px-4 py-2 text-left">Seats</th>
              <th className="px-4 py-2 text-left">Waitlist</th>
              <th className="px-4 py-2 text-left">Enrollment window</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {workshops.map(workshop => (
              <tr key={workshop.id} className="border-t align-top">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {workshop.semester
                    ? `${new Date(workshop.semester.starts_at).toLocaleDateString()} - ${new Date(workshop.semester.ends_at).toLocaleDateString()}`
                    : workshop.semester_id.slice(0, 8)}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{workshop.description ?? 'Workshop'}</p>
                  <p className="text-xs text-muted-foreground">{workshop.id.slice(0, 8)}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{workshop.approvedCount} / {workshop.capacity}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{workshop.waitlistedCount} / {workshop.wait_list_capacity}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <p>
                    {workshop.enrollment_open_at
                      ? new Date(workshop.enrollment_open_at).toLocaleDateString()
                      : 'Open'}{' '}
                    -{' '}
                    {workshop.enrollment_close_at
                      ? new Date(workshop.enrollment_close_at).toLocaleDateString()
                      : 'Close'}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {canEdit ? (
                    <fetcher.Form method="post" className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="intent" value="update-limits" />
                      <input type="hidden" name="workshop_id" value={workshop.id} />
                      <label className="space-y-1 text-xs">
                        <span className="block text-muted-foreground">Capacity</span>
                        <input
                          type="number"
                          min={0}
                          name="capacity"
                          defaultValue={workshop.capacity}
                          className="h-8 w-20 rounded border border-input bg-background px-2"
                        />
                      </label>
                      <label className="space-y-1 text-xs">
                        <span className="block text-muted-foreground">Waitlist</span>
                        <input
                          type="number"
                          min={0}
                          name="wait_list_capacity"
                          defaultValue={workshop.wait_list_capacity}
                          className="h-8 w-20 rounded border border-input bg-background px-2"
                        />
                      </label>
                      <button
                        type="submit"
                        className="h-8 rounded bg-primary px-3 text-xs font-medium text-primary-foreground"
                      >
                        Save
                      </button>
                    </fetcher.Form>
                  ) : (
                    <p className="text-xs text-muted-foreground">Staff only</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fetcher.data?.error ? <p className="text-sm text-destructive">{fetcher.data.error}</p> : null}
      {fetcher.data?.success ? <p className="text-sm text-emerald-600">{fetcher.data.success}</p> : null}
    </div>
  )
}
