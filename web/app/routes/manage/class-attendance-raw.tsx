import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'
import type { Route } from './+types/class-attendance-raw'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'

const CLASS_ATTENDANCE_FETCH_BATCH_SIZE = 1000
const IN_CLAUSE_BATCH_SIZE = 150

type RawAttendanceRow = {
  id: string
  class_id: string
  profile_id: string
  state: 'active' | 'inactive'
  inactive_at: string | null
  inactive_by: string | null
  inactive_reason: string | null
  status: 'unknown' | 'present' | 'absent' | null
  photo_status: 'uploaded' | 'accepted' | 'rejected' | 'expired' | null
  camera_on: boolean | null
  recorded_by: string | null
  created_at: string
  updated_at: string
}

type ProfileLookupRow = {
  id: string
  firstname: string | null
  surname: string | null
  email: string | null
}

const displayName = (profile: ProfileLookupRow | null) => {
  const first = (profile?.firstname ?? '').trim()
  const last = (profile?.surname ?? '').trim()
  const full = [first, last].filter(Boolean).join(' ').trim()
  if (full) return full
  if (profile?.email) return profile.email
  return ''
}

const displayNameOrId = (profile: ProfileLookupRow | null, fallbackId: string) => {
  const label = displayName(profile)
  return label || `Unknown student (${fallbackId.slice(0, 8)})`
}

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const rows: RawAttendanceRow[] = []
  for (let offset = 0; ; offset += CLASS_ATTENDANCE_FETCH_BATCH_SIZE) {
    const { data, error } = await adminClient
      .from('class_attendance')
      .select('id, class_id, profile_id, state, inactive_at, inactive_by, inactive_reason, status, photo_status, camera_on, recorded_by, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + CLASS_ATTENDANCE_FETCH_BATCH_SIZE - 1)

    if (error) {
      throw new Response(error.message, { status: 500, headers: auth.headers })
    }

    const chunk = (data ?? []) as RawAttendanceRow[]
    rows.push(...chunk)
    if (chunk.length < CLASS_ATTENDANCE_FETCH_BATCH_SIZE) {
      break
    }
  }

  const profileIds = Array.from(new Set(rows.map(row => row.profile_id).filter(Boolean)))
  const profileRows: ProfileLookupRow[] = []

  for (const chunk of chunkArray(profileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, firstname, surname, email')
      .in('id', chunk)

    if (error) {
      throw new Response(error.message, { status: 500, headers: auth.headers })
    }

    profileRows.push(...((data ?? []) as ProfileLookupRow[]))
  }

  const profileById = new Map(profileRows.map(profile => [profile.id, profile]))

  const enrichedRows = rows.map(row => ({
    ...row,
    state: row.state === 'inactive' ? 'inactive' : 'active',
    inactive_at: row.inactive_at ?? null,
    inactive_by: row.inactive_by ?? null,
    inactive_reason: row.inactive_reason ?? null,
    profile_display: displayNameOrId(profileById.get(row.profile_id) ?? null, row.profile_id),
  }))

  return {
    label: 'Raw Class Attendance',
    tableName: 'class-attendance-raw',
    columns: [
      'class_id',
      'profile_display',
      'profile_id',
      'state',
      'inactive_at',
      'inactive_by',
      'inactive_reason',
      'status',
      'photo_status',
      'camera_on',
      'recorded_by',
      'created_at',
      'updated_at',
      'id',
    ],
    rows: enrichedRows,
    columnMeta: {
      class_id: { label: 'Class ID', filterable: true },
      profile_display: {
        label: 'Profile',
        filterable: true,
        fitContentOnLoad: true,
        hoverCard: {
          titleField: 'profile_hover_name',
          titleFallback: 'N/A',
          columns: {
            rightTitleField: 'profile_hover_parent_name',
            rightTitleFallback: 'Parent',
            left: [
              { label: '', field: 'profile_hover_email', fallback: '' },
              { label: '', field: 'profile_hover_student_phone', fallback: '' },
              { label: '', field: 'profile_hover_student_geo', fallback: '' },
              { label: '', field: 'profile_hover_student_submitted_address', fallback: '' },
            ],
            right: [
              { label: '', field: 'profile_hover_parent_email', fallback: '' },
              { label: '', field: 'profile_hover_parent_phone', fallback: '' },
              { label: '', field: 'profile_hover_parent_geo', fallback: '' },
              { label: '', field: 'profile_hover_parent_address', fallback: '' },
            ],
          },
          fields: [
            { label: 'Top Discrepancy', field: 'profile_hover_top_discrepancy' },
            { label: 'More Open', field: 'profile_hover_more_discrepancies' },
          ],
        },
      },
      profile_id: { label: 'Profile ID', filterable: true },
      state: { label: 'State', filterable: true },
      inactive_at: { label: 'Inactive at', filterable: true },
      inactive_by: { label: 'Inactive by (user id)', filterable: true, truncate: true },
      inactive_reason: { label: 'Inactive reason', filterable: true, truncate: true },
      status: { label: 'Attendance', filterable: true },
      photo_status: { label: 'Photo status', filterable: true },
      camera_on: { label: 'Camera on', filterable: true },
      recorded_by: { label: 'Recorded by (user id)', filterable: true, truncate: true },
      created_at: { label: 'Created', filterable: true },
      updated_at: { label: 'Updated', filterable: true },
      id: { label: 'Attendance ID', filterable: true },
    },
  }
}

export const action = createTableAction('class-attendance-raw')

export default function ClassAttendanceRawTablePage() {
  return <TableDisplay />
}
