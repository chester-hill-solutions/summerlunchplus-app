import { createClient } from '@/lib/supabase/server'
import type { Route } from './+types/attendance'
import TableDisplay from './table-display'

type AttendanceRow = {
  id: string
  class_id: string
  profile_id: string
  status: 'unknown' | 'present' | 'absent' | null
  photo_status: 'accepted' | 'declined' | null
  camera_on: boolean | null
  recorded_by: string | null
  created_at: string
  updated_at: string
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createClient(request)
  const { data, error } = await supabase
    .from('class_attendance')
    .select('id, class_id, profile_id, status, photo_status, camera_on, recorded_by, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Response(error.message, { status: 500 })
  }

  return {
    label: 'Attendance (Raw)',
    tableName: 'attendance-raw',
    columns: ['id', 'class_id', 'profile_id', 'status', 'photo_status', 'camera_on', 'recorded_by', 'created_at', 'updated_at'],
    rows: (data ?? []) as AttendanceRow[],
    columnMeta: {
      id: { filterable: true },
      class_id: { label: 'Class ID', filterable: true },
      profile_id: { label: 'Profile ID', filterable: true },
      status: { filterable: true },
      photo_status: { label: 'Photo status', filterable: true },
      camera_on: { label: 'Camera on', filterable: true },
      recorded_by: { label: 'Recorded by user_id', filterable: true, truncate: true },
      created_at: { label: 'Created', filterable: true },
      updated_at: { label: 'Updated', filterable: true },
    },
  }
}

export default function AttendanceRawTablePage() {
  return <TableDisplay />
}
