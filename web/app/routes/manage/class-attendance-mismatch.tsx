import { useEffect, useMemo, useState } from 'react'
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/class-attendance-mismatch'

const FETCH_BATCH_SIZE = 1000
const IN_CLAUSE_BATCH_SIZE = 150
const UPDATE_IN_CLAUSE_BATCH_SIZE = 100

type AttendanceRow = {
  id: string
  class_id: string
  profile_id: string
  state: 'active' | 'inactive'
  inactive_at: string | null
  inactive_reason: string | null
  class:
    | {
        id: string
        starts_at: string
        workshop_id: string | null
        workshop:
          | {
              id: string
              description: string | null
            }
          | Array<{
              id: string
              description: string | null
            }>
          | null
      }
    | Array<{
        id: string
        starts_at: string
        workshop_id: string | null
        workshop:
          | {
              id: string
              description: string | null
            }
          | Array<{
              id: string
              description: string | null
            }>
          | null
      }>
    | null
  profile:
    | {
        id: string
        firstname: string | null
        surname: string | null
        email: string | null
      }
    | Array<{
        id: string
        firstname: string | null
        surname: string | null
        email: string | null
      }>
    | null
}

type EnrollmentRow = {
  workshop_id: string
  profile_id: string
  status: string
}

type MismatchRow = {
  id: string
  class_id: string
  profile_id: string
  workshop_id: string
  workshop_description: string
  class_starts_at: string
  profile_display: string
  enrollment_status: string
  state: 'active' | 'inactive'
  inactive_at: string | null
  inactive_reason: string | null
}

type ActionData = {
  ok?: boolean
  error?: string
  updatedCount?: number
}

const relationRow = <T extends Record<string, unknown>>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null
  if (value && typeof value === 'object') return value
  return null
}

const chunkArray = <T,>(items: T[], size: number) => {
  if (!items.length || size <= 0) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const profileDisplay = (
  profile:
    | {
        firstname: string | null
        surname: string | null
        email: string | null
      }
    | null,
  fallbackId: string
) => {
  const first = (profile?.firstname ?? '').trim()
  const last = (profile?.surname ?? '').trim()
  const fullName = [first, last].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  if (profile?.email) return profile.email
  return `Unknown student (${fallbackId.slice(0, 8)})`
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const attendanceRows: AttendanceRow[] = []
  for (let offset = 0; ; offset += FETCH_BATCH_SIZE) {
    const { data, error } = await adminClient
      .from('class_attendance')
      .select(
        'id, class_id, profile_id, state, inactive_at, inactive_reason, class:class_id(id, starts_at, workshop_id, workshop:workshop_id(id, description)), profile:profile_id(id, firstname, surname, email)'
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + FETCH_BATCH_SIZE - 1)

    if (error) {
      throw new Response(error.message, { status: 500, headers: auth.headers })
    }

    const chunk = (data ?? []) as AttendanceRow[]
    attendanceRows.push(...chunk)
    if (chunk.length < FETCH_BATCH_SIZE) break
  }

  const workshopIds = Array.from(
    new Set(
      attendanceRows
        .map(row => relationRow(row.class)?.workshop_id)
        .filter((id): id is string => Boolean(id))
    )
  )
  const profileIds = Array.from(new Set(attendanceRows.map(row => row.profile_id).filter(Boolean)))

  const enrollmentRows: EnrollmentRow[] = []
  for (const workshopChunk of chunkArray(workshopIds, IN_CLAUSE_BATCH_SIZE)) {
    for (const profileChunk of chunkArray(profileIds, IN_CLAUSE_BATCH_SIZE)) {
      const { data, error } = await adminClient
        .from('workshop_enrollment')
        .select('workshop_id, profile_id, status')
        .in('workshop_id', workshopChunk)
        .in('profile_id', profileChunk)

      if (error) {
        throw new Response(error.message, { status: 500, headers: auth.headers })
      }
      enrollmentRows.push(...((data ?? []) as EnrollmentRow[]))
    }
  }

  const enrollmentByPair = new Map<string, string>()
  for (const enrollment of enrollmentRows) {
    enrollmentByPair.set(`${enrollment.workshop_id}::${enrollment.profile_id}`, enrollment.status)
  }

  const mismatches: MismatchRow[] = attendanceRows
    .map(row => {
      const classRow = relationRow(row.class)
      const workshop = relationRow(classRow?.workshop ?? null)
      const profile = relationRow(row.profile)
      const workshopId = classRow?.workshop_id ?? null
      if (!workshopId || !classRow?.starts_at) return null

      const status = enrollmentByPair.get(`${workshopId}::${row.profile_id}`) ?? 'missing'
      if (status === 'approved') return null

      return {
        id: row.id,
        class_id: row.class_id,
        profile_id: row.profile_id,
        workshop_id: workshopId,
        workshop_description: workshop?.description?.trim() || 'Workshop',
        class_starts_at: classRow.starts_at,
        profile_display: profileDisplay(profile, row.profile_id),
        enrollment_status: status,
        state: row.state === 'inactive' ? 'inactive' : 'active',
        inactive_at: row.inactive_at ?? null,
        inactive_reason: row.inactive_reason ?? null,
      } satisfies MismatchRow
    })
    .filter((row): row is MismatchRow => Boolean(row))
    .sort((left, right) => {
      if (left.state !== right.state) return left.state === 'active' ? -1 : 1
      const leftStart = new Date(left.class_starts_at).getTime()
      const rightStart = new Date(right.class_starts_at).getTime()
      if (leftStart !== rightStart) return leftStart - rightStart
      return left.profile_display.localeCompare(right.profile_display)
    })

  return {
    mismatches,
    activeCount: mismatches.filter(row => row.state === 'active').length,
    inactiveCount: mismatches.filter(row => row.state === 'inactive').length,
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    return { error: 'Unauthorized' } satisfies ActionData
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  if (intent !== 'inactivate-selected') {
    return { error: 'Unsupported action.' } satisfies ActionData
  }

  const attendanceIds = Array.from(
    new Set(
      formData
        .getAll('attendance_id')
        .map(value => String(value).trim())
        .filter(Boolean)
    )
  )
  if (!attendanceIds.length) {
    return { error: 'Select at least one attendance row.' } satisfies ActionData
  }

  const reason = (String(formData.get('inactive_reason') ?? '').trim() ||
    'Profile is not approved for the class workshop') as string

  const { supabase } = createClient(request)
  const nowIso = new Date().toISOString()
  let updatedCount = 0

  for (const attendanceIdChunk of chunkArray(attendanceIds, UPDATE_IN_CLAUSE_BATCH_SIZE)) {
    const { error, count } = await supabase
      .from('class_attendance')
      .update(
        {
          state: 'inactive',
          inactive_at: nowIso,
          inactive_by: auth.user.id,
          inactive_reason: reason,
          recorded_by: auth.user.id,
        },
        { count: 'exact' }
      )
      .in('id', attendanceIdChunk)
      .eq('state', 'active')

    if (error) {
      return { error: error.message } satisfies ActionData
    }

    updatedCount += count ?? 0
  }

  return { ok: true, updatedCount } satisfies ActionData
}

export default function ClassAttendanceMismatchPage() {
  const { mismatches, activeCount, inactiveCount } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>() as ActionData | undefined
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const [viewState, setViewState] = useState<'active' | 'inactive'>('active')
  const visibleMismatches = useMemo(
    () => mismatches.filter(row => row.state === viewState),
    [mismatches, viewState]
  )
  const selectableIds = useMemo(
    () => visibleMismatches.filter(row => row.state === 'active').map(row => row.id),
    [visibleMismatches]
  )
  const [selectedIds, setSelectedIds] = useState<string[]>(selectableIds)

  useEffect(() => {
    setSelectedIds(selectableIds)
  }, [selectableIds])

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const toggleSelectedId = (attendanceId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(attendanceId)) {
        return prev.filter(id => id !== attendanceId)
      }
      return [...prev, attendanceId]
    })
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">System</p>
        <h1 className="text-2xl font-semibold">Class attendance mismatch</h1>
        <p className="text-sm text-muted-foreground">
          Find attendance rows whose profile is not approved for the class workshop, then inactivate them.
        </p>
      </header>

      <section className="grid gap-3 rounded-lg border bg-card p-4 text-sm md:grid-cols-3">
        <p>
          <span className="font-medium">Total mismatches:</span> {mismatches.length}
        </p>
        <p>
          <span className="font-medium">Active mismatches:</span> {activeCount}
        </p>
        <p>
          <span className="font-medium">Inactive mismatches:</span> {inactiveCount}
        </p>
      </section>

      <section className="rounded-lg border bg-card p-3">
        <div className="inline-flex items-center rounded border border-input bg-background p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewState('active')}
            className={`rounded px-2 py-1 ${viewState === 'active' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            Active mismatches ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setViewState('inactive')}
            className={`rounded px-2 py-1 ${viewState === 'inactive' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            Inactive mismatches ({inactiveCount})
          </button>
        </div>
      </section>

      {mismatches.length ? (
        <Form method="post" className="space-y-3 rounded-lg border bg-card p-4">
          <input type="hidden" name="intent" value="inactivate-selected" />
          {selectedIds.map(attendanceId => (
            <input key={`selected-${attendanceId}`} type="hidden" name="attendance_id" value={attendanceId} />
          ))}
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm min-w-[22rem]">
              <span className="text-muted-foreground">Inactive reason</span>
              <input
                type="text"
                name="inactive_reason"
                defaultValue="Profile is not approved for the class workshop"
                className="h-10 rounded border border-input bg-background px-3"
                disabled={viewState !== 'active'}
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting || viewState !== 'active' || activeCount === 0 || selectedIds.length === 0}
              className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
            >
              {isSubmitting ? 'Inactivating...' : 'Inactivate selected active rows'}
            </button>
            <button
              type="button"
              disabled={isSubmitting || viewState !== 'active' || activeCount === 0}
              onClick={() => setSelectedIds(selectableIds)}
              className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={isSubmitting || viewState !== 'active' || selectedIds.length === 0}
              onClick={() => setSelectedIds([])}
              className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
            >
              Select none
            </button>
            <p className="text-xs text-muted-foreground">
              {viewState === 'active' ? `${selectedIds.length} selected` : `${visibleMismatches.length} shown`}
            </p>
          </div>

          <div className="max-h-[34rem] overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Pick</th>
                  <th className="px-3 py-2">Profile</th>
                  <th className="px-3 py-2">Workshop</th>
                  <th className="px-3 py-2">Class starts</th>
                  <th className="px-3 py-2">Enrollment status</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Inactive reason</th>
                </tr>
              </thead>
              <tbody>
                {visibleMismatches.map(row => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIdSet.has(row.id)}
                        onChange={() => toggleSelectedId(row.id)}
                        disabled={row.state !== 'active' || isSubmitting}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.profile_display}</div>
                      <div className="text-xs text-muted-foreground">{row.profile_id}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{row.workshop_description}</div>
                      <div className="text-xs text-muted-foreground">{row.workshop_id}</div>
                    </td>
                    <td className="px-3 py-2">{row.class_starts_at}</td>
                    <td className="px-3 py-2">{row.enrollment_status}</td>
                    <td className="px-3 py-2">{row.state}</td>
                    <td className="px-3 py-2">{row.inactive_reason ?? 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Form>
      ) : (
        <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No mismatches found.
        </section>
      )}

      {actionData?.error ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {actionData.error}
        </section>
      ) : null}
      {actionData?.ok ? (
        <section className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          Inactivated {actionData.updatedCount ?? 0} row(s).
        </section>
      ) : null}
    </div>
  )
}
