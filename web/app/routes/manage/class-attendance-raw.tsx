import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'
import type { Route } from './+types/class-attendance-raw'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'

const CLASS_ATTENDANCE_FETCH_BATCH_SIZE = 1000

type RawAttendanceRow = {
  id: string
  class_id: string
  profile_id: string
  status: 'unknown' | 'present' | 'absent' | null
  photo_status: 'uploaded' | 'accepted' | 'rejected' | null
  camera_on: boolean | null
  recorded_by: string | null
  created_at: string
  updated_at: string
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
      .select('id, class_id, profile_id, status, photo_status, camera_on, recorded_by, created_at, updated_at')
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

  return {
    label: 'Raw Class Attendance',
    tableName: 'class-attendance-raw',
    columns: ['class_id', 'profile_id', 'status', 'photo_status', 'camera_on', 'recorded_by', 'created_at', 'updated_at', 'id'],
    rows,
    columnMeta: {
      class_id: { label: 'Class ID', filterable: true },
      profile_id: { label: 'Profile ID', filterable: true },
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
