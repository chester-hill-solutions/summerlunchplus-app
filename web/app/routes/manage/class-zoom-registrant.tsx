import { redirect } from 'react-router'
import { createClient } from '@/lib/supabase/server'
import type { Route } from './+types/class-zoom-registrant'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class-zoom-registrant')
const IN_CLAUSE_BATCH_SIZE = 150

const UNSUPPORTED_FILTER_COLUMNS = new Set([
  'workshop_description',
  'class_starts_at',
  'class_ends_at',
  'class_display',
  'profile_display',
  'class_zoom_meeting_display',
])

const UNSUPPORTED_SORT_COLUMNS = new Set([
  'workshop_description',
  'class_starts_at',
  'class_ends_at',
  'class_display',
  'profile_display',
  'class_zoom_meeting_display',
])

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

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
  const url = new URL(args.request.url)
  let normalized = false

  for (const key of Array.from(url.searchParams.keys())) {
    if (!key.startsWith('f_')) continue
    const column = key.slice(2)
    if (!UNSUPPORTED_FILTER_COLUMNS.has(column)) continue
    url.searchParams.delete(key)
    normalized = true
  }

  const sortColumn = (url.searchParams.get('sort') ?? '').trim()
  if (sortColumn && UNSUPPORTED_SORT_COLUMNS.has(sortColumn)) {
    url.searchParams.delete('sort')
    url.searchParams.delete('dir')
    normalized = true
  }

  if (normalized) {
    const nextSearch = url.searchParams.toString()
    throw redirect(nextSearch ? `${url.pathname}?${nextSearch}` : url.pathname)
  }

  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as RegistrantRow[]
  const classIds = Array.from(new Set(rows.map(row => (typeof row.class_id === 'string' ? row.class_id : '')).filter(Boolean)))
  const meetingIds = Array.from(
    new Set(rows.map(row => (typeof row.class_zoom_meeting_id === 'string' ? row.class_zoom_meeting_id : '')).filter(Boolean))
  )
  const { supabase } = createClient(args.request)

  const fetchClasses = async () => {
    const classRows: Array<{ id: string; ends_at: string | null }> = []
    for (const classIdChunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
      const { data, error } = await supabase.from('class').select('id, ends_at').in('id', classIdChunk)
      if (error) throw new Response(error.message, { status: 500 })
      classRows.push(...((data ?? []) as typeof classRows))
    }
    return classRows
  }

  const fetchMeetings = async () => {
    const meetingRows: Array<{
      id: string
      zoom_meeting_id: string | null
      topic: string | null
      host_zoom_user_email: string | null
      start_time: string | null
      duration_minutes: number | null
      status: string
      join_url: string | null
    }> = []

    for (const meetingIdChunk of chunkArray(meetingIds, IN_CLAUSE_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from('class_zoom_meeting')
        .select('id, zoom_meeting_id, topic, host_zoom_user_email, start_time, duration_minutes, status, join_url')
        .in('id', meetingIdChunk)
      if (error) throw new Response(error.message, { status: 500 })
      meetingRows.push(...((data ?? []) as typeof meetingRows))
    }

    return meetingRows
  }

  const [classRows, meetingRows] = await Promise.all([
    classIds.length ? fetchClasses() : Promise.resolve([] as Array<{ id: string; ends_at: string | null }>),
    meetingIds.length
      ? fetchMeetings()
      : Promise.resolve(
          [] as Array<{
            id: string
            zoom_meeting_id: string | null
            topic: string | null
            host_zoom_user_email: string | null
            start_time: string | null
            duration_minutes: number | null
            status: string
            join_url: string | null
          }>
        ),
  ])

  const classById = new Map((classRows ?? []).map(row => [row.id, row]))
  const meetingById = new Map((meetingRows ?? []).map(row => [row.id, row]))
  const baseProfileMeta =
    base.columnMeta && typeof base.columnMeta === 'object'
      ? (base.columnMeta as Record<string, Record<string, unknown>>).profile_display
      : undefined

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
      workshop_description: { label: 'Workshop', filterable: false },
      class_starts_at: { label: 'Class starts', filterable: false },
      class_ends_at: { label: 'Class ends', filterable: false },
      profile_display: {
        ...(baseProfileMeta && typeof baseProfileMeta === 'object' ? baseProfileMeta : {}),
        filterable: false,
      },
      class_zoom_meeting_display: {
        label: 'Class zoom meeting',
        filterable: false,
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
