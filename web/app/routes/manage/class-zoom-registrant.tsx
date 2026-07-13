import { createClient } from '@/lib/supabase/server'
import type { Route } from './+types/class-zoom-registrant'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class-zoom-registrant')

type RegistrantRow = Record<string, unknown> & {
  class_id?: string
  class_zoom_meeting_id?: string
  class_display?: { label?: unknown; timestamp?: unknown } | string | null
}

const classLabel = (value: RegistrantRow['class_display']) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof value.label === 'string') return value.label
  return 'Workshop'
}

const classTimestamp = (value: RegistrantRow['class_display']) => {
  if (value && typeof value === 'object' && typeof value.timestamp === 'string') return value.timestamp
  return null
}

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as RegistrantRow[]
  const classIds = Array.from(new Set(rows.map(row => (typeof row.class_id === 'string' ? row.class_id : '')).filter(Boolean)))
  const meetingIds = Array.from(
    new Set(rows.map(row => (typeof row.class_zoom_meeting_id === 'string' ? row.class_zoom_meeting_id : '')).filter(Boolean))
  )
  const { supabase } = createClient(args.request)

  const [{ data: classRows }, { data: meetingRows }] = await Promise.all([
    classIds.length
      ? supabase.from('class').select('id, ends_at').in('id', classIds)
      : Promise.resolve({ data: [] as Array<{ id: string; ends_at: string | null }> }),
    meetingIds.length
      ? supabase
          .from('class_zoom_meeting')
          .select('id, zoom_meeting_id, topic, host_zoom_user_email, start_time, duration_minutes, status, join_url')
          .in('id', meetingIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string
            zoom_meeting_id: string | null
            topic: string | null
            host_zoom_user_email: string | null
            start_time: string | null
            duration_minutes: number | null
            status: string
            join_url: string | null
          }>,
        }),
  ])

  const classById = new Map((classRows ?? []).map(row => [row.id, row]))
  const meetingById = new Map((meetingRows ?? []).map(row => [row.id, row]))

  return {
    ...base,
    rows: rows.map(row => {
      const meetingId = typeof row.class_zoom_meeting_id === 'string' ? row.class_zoom_meeting_id : ''
      const meeting = meetingById.get(meetingId)
      return {
        ...row,
        workshop_description: classLabel(row.class_display),
        class_starts_at: classTimestamp(row.class_display),
        class_ends_at:
          typeof row.class_id === 'string' && classById.get(row.class_id)?.ends_at
            ? classById.get(row.class_id)?.ends_at ?? null
            : null,
        hover_zoom_topic: meeting?.topic ?? '',
        hover_zoom_status: meeting?.status ?? '',
        hover_zoom_host_email: meeting?.host_zoom_user_email ?? '',
        hover_zoom_start_at: meeting?.start_time ?? '',
        hover_zoom_duration_minutes: typeof meeting?.duration_minutes === 'number' ? String(meeting.duration_minutes) : '',
        hover_zoom_join_url: meeting?.join_url ?? '',
      }
    }),
    columns: [
      'workshop_description',
      'class_starts_at',
      'class_ends_at',
      ...(base.columns ?? []).filter(column => column !== 'class_display'),
    ],
    columnMeta: {
      ...(base.columnMeta ?? {}),
      workshop_description: { label: 'Workshop', filterable: true },
      class_starts_at: { label: 'Class starts', filterable: true },
      class_ends_at: { label: 'Class ends', filterable: true },
      class_zoom_meeting_display: {
        label: 'Class zoom meeting',
        filterable: true,
        hoverCard: {
          titleField: 'hover_zoom_topic',
          titleFallback: 'Meeting details',
          fields: [
            { label: 'Meeting ID', field: 'class_zoom_meeting_display', fallback: 'Loading...' },
            { label: 'Status', field: 'hover_zoom_status', fallback: 'Loading...' },
            { label: 'Host', field: 'hover_zoom_host_email', fallback: 'Loading...' },
            { label: 'Start', field: 'hover_zoom_start_at', fallback: 'Loading...' },
            { label: 'Duration min', field: 'hover_zoom_duration_minutes', fallback: 'Loading...' },
            { label: 'Join URL', field: 'hover_zoom_join_url', fallback: 'Loading...' },
          ],
        },
      },
    },
  }
}

export const action = createTableAction('class-zoom-registrant')

export default function ClassZoomRegistrantTablePage() {
  return <TableDisplay />
}
