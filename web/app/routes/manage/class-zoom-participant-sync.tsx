import { createClient } from '@/lib/supabase/server'
import type { Route } from './+types/class-zoom-participant-sync'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class-zoom-participant-sync')

type SyncRow = Record<string, unknown> & {
  class_zoom_meeting_id?: string
}

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as SyncRow[]
  const meetingIds = Array.from(
    new Set(rows.map(row => (typeof row.class_zoom_meeting_id === 'string' ? row.class_zoom_meeting_id : '')).filter(Boolean))
  )

  const { supabase } = createClient(args.request)
  const { data: meetingRows } = meetingIds.length
    ? await supabase.from('class_zoom_meeting').select('id, class_id').in('id', meetingIds)
    : { data: [] as Array<{ id: string; class_id: string }> }

  const classIds = Array.from(new Set((meetingRows ?? []).map(row => row.class_id).filter((id): id is string => Boolean(id))))
  const { data: classRows } = classIds.length
    ? await supabase
        .from('class')
        .select('id, starts_at, ends_at, workshop:workshop_id ( description )')
        .in('id', classIds)
    : { data: [] as Array<{ id: string; starts_at: string; ends_at: string; workshop: { description: string | null } | null }> }

  const classById = new Map((classRows ?? []).map(row => [row.id, row]))
  const classIdByMeetingId = new Map((meetingRows ?? []).map(row => [row.id, row.class_id]))

  return {
    ...base,
    rows: rows.map(row => {
      const classId = typeof row.class_zoom_meeting_id === 'string' ? classIdByMeetingId.get(row.class_zoom_meeting_id) : null
      const classRow = classId ? classById.get(classId) : null
      const workshopRelation = Array.isArray(classRow?.workshop) ? classRow.workshop[0] : classRow?.workshop
      return {
        ...row,
        workshop_description: workshopRelation?.description ?? 'Workshop',
        class_starts_at: classRow?.starts_at ?? null,
        class_ends_at: classRow?.ends_at ?? null,
      }
    }),
    columns: ['workshop_description', 'class_starts_at', 'class_ends_at', ...(base.columns ?? [])],
    columnMeta: {
      ...(base.columnMeta ?? {}),
      workshop_description: { label: 'Workshop', filterable: true },
      class_starts_at: { label: 'Class starts', filterable: true },
      class_ends_at: { label: 'Class ends', filterable: true },
    },
  }
}

export const action = createTableAction('class-zoom-participant-sync')

export default function ClassZoomParticipantSyncTablePage() {
  return <TableDisplay />
}
