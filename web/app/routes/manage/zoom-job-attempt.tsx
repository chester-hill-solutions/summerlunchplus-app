import { createClient } from '@/lib/supabase/server'
import type { Route } from './+types/zoom-job-attempt'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('zoom-job-attempt')

type AttemptRow = Record<string, unknown> & {
  class_id?: string
  profile_id?: string
  class_zoom_meeting_id?: string
  class_zoom_registrant_id?: string
  status?: string
  error_message?: string | null
  result_payload?: Record<string, unknown> | null
}

const profileDisplay = (row: { firstname: string | null; surname: string | null; email: string | null }, fallbackId: string) => {
  const first = (row.firstname ?? '').trim()
  const last = (row.surname ?? '').trim()
  const fullName = [first, last].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  const email = (row.email ?? '').trim()
  return email || `ID ${fallbackId}`
}

const toSkipReason = (row: AttemptRow) => {
  if (row.status !== 'skipped') return ''
  const payload = row.result_payload
  if (payload && typeof payload === 'object') {
    const reason = payload.reason
    if (typeof reason === 'string' && reason.trim()) return reason.trim()
    const skipReason = payload.skipReason
    if (typeof skipReason === 'string' && skipReason.trim()) return skipReason.trim()
  }
  if (typeof row.error_message === 'string' && row.error_message.trim()) return row.error_message.trim()
  return 'No skip reason recorded'
}

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as AttemptRow[]

  const classIds = Array.from(new Set(rows.map(row => (typeof row.class_id === 'string' ? row.class_id : '')).filter(Boolean)))
  const profileIds = Array.from(new Set(rows.map(row => (typeof row.profile_id === 'string' ? row.profile_id : '')).filter(Boolean)))
  const meetingIds = Array.from(
    new Set(rows.map(row => (typeof row.class_zoom_meeting_id === 'string' ? row.class_zoom_meeting_id : '')).filter(Boolean))
  )
  const registrantIds = Array.from(
    new Set(rows.map(row => (typeof row.class_zoom_registrant_id === 'string' ? row.class_zoom_registrant_id : '')).filter(Boolean))
  )

  const { supabase } = createClient(args.request)

  const [{ data: classRows }, { data: meetingRows }, { data: registrantRows }] = await Promise.all([
    classIds.length
      ? supabase
          .from('class')
          .select('id, starts_at, ends_at, workshop:workshop_id ( description )')
          .in('id', classIds)
      : Promise.resolve({ data: [] as Array<{ id: string; starts_at: string | null; ends_at: string | null; workshop: { description: string | null } | null }> }),
    meetingIds.length
      ? supabase
          .from('class_zoom_meeting')
          .select('id, class_id, zoom_meeting_id, topic, host_zoom_user_email, start_time, duration_minutes, status, join_url')
          .in('id', meetingIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string
            class_id: string | null
            zoom_meeting_id: string | null
            topic: string | null
            host_zoom_user_email: string | null
            start_time: string | null
            duration_minutes: number | null
            status: string
            join_url: string | null
          }>,
        }),
    registrantIds.length
      ? supabase
          .from('class_zoom_registrant')
          .select('id, class_id, profile_id, class_zoom_meeting_id, zoom_registrant_id, zoom_join_url, last_sent_at')
          .in('id', registrantIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string
            class_id: string
            profile_id: string
            class_zoom_meeting_id: string
            zoom_registrant_id: string | null
            zoom_join_url: string | null
            last_sent_at: string | null
          }>,
        }),
  ])

  const enrichedProfileIds = new Set(profileIds)
  for (const registrant of registrantRows ?? []) {
    if (typeof registrant.profile_id === 'string' && registrant.profile_id) {
      enrichedProfileIds.add(registrant.profile_id)
    }
  }

  const { data: profileRows } = enrichedProfileIds.size
    ? await supabase
        .from('profile')
        .select('id, firstname, surname, email')
        .in('id', Array.from(enrichedProfileIds))
    : { data: [] as Array<{ id: string; firstname: string | null; surname: string | null; email: string | null }> }

  const classById = new Map((classRows ?? []).map(row => [row.id, row]))
  const profileById = new Map((profileRows ?? []).map(row => [row.id, row]))
  const meetingById = new Map((meetingRows ?? []).map(row => [row.id, row]))
  const registrantById = new Map((registrantRows ?? []).map(row => [row.id, row]))

  return {
    ...base,
    rows: rows.map(row => {
      const classId = typeof row.class_id === 'string' ? row.class_id : ''
      const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
      const meetingId = typeof row.class_zoom_meeting_id === 'string' ? row.class_zoom_meeting_id : ''
      const registrantId = typeof row.class_zoom_registrant_id === 'string' ? row.class_zoom_registrant_id : ''

      const classRow = classById.get(classId)
      const workshopRelation = Array.isArray(classRow?.workshop) ? classRow.workshop[0] : classRow?.workshop
      const meetingRow = meetingById.get(meetingId)
      const registrantRow = registrantById.get(registrantId)
      const effectiveProfileId = profileId || (typeof registrantRow?.profile_id === 'string' ? registrantRow.profile_id : '')
      const profileRow = profileById.get(effectiveProfileId)
      const registrantProfile = registrantRow?.profile_id ? profileById.get(registrantRow.profile_id) : null

      return {
        ...row,
        workshop_description: workshopRelation?.description ?? '',
        class_starts_at: classRow?.starts_at ?? null,
        class_ends_at: classRow?.ends_at ?? null,
        profile_display: profileRow ? profileDisplay(profileRow, effectiveProfileId) : effectiveProfileId ? `ID ${effectiveProfileId}` : '',
        class_zoom_meeting_display: meetingRow?.zoom_meeting_id ?? meetingId,
        class_zoom_registrant_display: registrantRow?.zoom_registrant_id ?? registrantId,
        skip_reason: toSkipReason(row),
        outcome_message:
          row.status === 'skipped'
            ? toSkipReason(row)
            : typeof row.error_message === 'string' && row.error_message.trim()
              ? row.error_message
              : '',

        hover_zoom_topic: meetingRow?.topic ?? '',
        hover_zoom_host_email: meetingRow?.host_zoom_user_email ?? '',
        hover_zoom_status: meetingRow?.status ?? '',
        hover_zoom_start_at: meetingRow?.start_time ?? '',
        hover_zoom_duration_minutes: typeof meetingRow?.duration_minutes === 'number' ? String(meetingRow.duration_minutes) : '',
        hover_zoom_join_url: meetingRow?.join_url ?? '',
        hover_zoom_class_workshop: workshopRelation?.description ?? '',
        hover_zoom_class_starts_at: classRow?.starts_at ?? '',

        hover_registrant_profile: registrantProfile ? profileDisplay(registrantProfile, registrantRow?.profile_id ?? '') : '',
        hover_registrant_profile_id: registrantRow?.profile_id ?? '',
        hover_registrant_join_url: registrantRow?.zoom_join_url ?? '',
        hover_registrant_last_sent_at: registrantRow?.last_sent_at ?? '',
      }
    }),
    columns: [
      'run_id',
      'action_type',
      'trigger_source',
      'trigger_kind',
      'status',
      'workshop_description',
      'class_starts_at',
      'class_ends_at',
      'profile_display',
      'class_zoom_meeting_display',
      'class_zoom_registrant_display',
      'duration_ms',
      'outcome_message',
      'started_at',
      'completed_at',
      'request_payload',
      'result_payload',
      'error_payload',
      'external_request_payload',
      'external_response_payload',
      'created_at',
    ],
    columnMeta: {
      ...(base.columnMeta ?? {}),
      workshop_description: { label: 'Workshop', filterable: true },
      class_starts_at: { label: 'Class starts', filterable: true },
      class_ends_at: { label: 'Class ends', filterable: true },
      profile_display: { label: 'Profile', filterable: true },
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
            { label: 'Workshop', field: 'hover_zoom_class_workshop', fallback: 'Loading...' },
            { label: 'Class start', field: 'hover_zoom_class_starts_at', fallback: 'Loading...' },
            { label: 'Zoom start', field: 'hover_zoom_start_at', fallback: 'Loading...' },
            { label: 'Duration min', field: 'hover_zoom_duration_minutes', fallback: 'Loading...' },
            { label: 'Join URL', field: 'hover_zoom_join_url', fallback: 'Loading...' },
          ],
        },
      },
      class_zoom_registrant_display: {
        label: 'Class zoom registrant',
        filterable: true,
        hoverCard: {
          titleField: 'hover_registrant_profile',
          titleFallback: 'Registrant details',
          fields: [
            { label: 'Registrant ID', field: 'class_zoom_registrant_display', fallback: 'Loading...' },
            { label: 'Profile', field: 'hover_registrant_profile', fallback: 'Loading...' },
            { label: 'Profile ID', field: 'hover_registrant_profile_id', fallback: 'Loading...' },
            { label: 'Join URL', field: 'hover_registrant_join_url', fallback: 'Loading...' },
            { label: 'Last sent', field: 'hover_registrant_last_sent_at', fallback: 'Loading...' },
          ],
        },
      },
      outcome_message: { label: 'Error / skip reason', filterable: true },
    },
  }
}

export const action = createTableAction('zoom-job-attempt')

export default function ZoomJobAttemptTablePage() {
  return <TableDisplay />
}
