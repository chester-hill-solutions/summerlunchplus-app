import { adminClient } from '@/lib/supabase/adminClient'
import { ZoomApiError, zoomApiClient } from '@/lib/zoom-jobs/zoom-api.client.server'

const HORIZON_MINUTES = 36 * 60
const IN_CLAUSE_BATCH_SIZE = 150

const toIso = (date: Date) => date.toISOString()

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const countByIds = async ({ table, column, ids }: { table: string; column: string; ids: string[] }) => {
  if (!ids.length) return 0
  let total = 0
  for (const chunk of chunkArray(ids, IN_CLAUSE_BATCH_SIZE)) {
    const { count, error } = await adminClient.from(table).select('id', { count: 'exact', head: true }).in(column, chunk)
    if (error) throw new Error(error.message)
    total += count ?? 0
  }
  return total
}

const listClassIdsInScope = async ({ now, scope }: { now: Date; scope: 'within_36h' | 'all_future' }) => {
  const query = adminClient.from('class').select('id').gte('starts_at', toIso(now)).order('starts_at', { ascending: true })
  if (scope === 'within_36h') {
    query.lt('starts_at', toIso(addMinutes(now, HORIZON_MINUTES)))
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(row => row.id)
}

export const resetZoomProcessingState = async ({
  now = new Date(),
  dryRun = false,
  scope = 'all_future',
}: {
  now?: Date
  dryRun?: boolean
  scope?: 'within_36h' | 'all_future'
}) => {
  const classIds = await listClassIdsInScope({ now, scope })

  if (!classIds.length) {
    return {
      dryRun,
      scope,
      classCount: 0,
      meetingCount: 0,
      registrantCount: 0,
      participantSyncCount: 0,
      participantCount: 0,
      attendanceCount: 0,
      attendanceRowsReset: 0,
      meetingsDeleted: 0,
      ranAt: now.toISOString(),
    }
  }

  const meetingCount = await countByIds({ table: 'class_zoom_meeting', column: 'class_id', ids: classIds })
  const registrantCount = await countByIds({ table: 'class_zoom_registrant', column: 'class_id', ids: classIds })
  const attendanceCount = await countByIds({ table: 'class_attendance', column: 'class_id', ids: classIds })

  const meetingIdRows: Array<{ id: string; zoom_meeting_id: string | null }> = []
  for (const chunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient.from('class_zoom_meeting').select('id, zoom_meeting_id').in('class_id', chunk)
    if (error) throw new Error(error.message)
    meetingIdRows.push(...((data ?? []) as Array<{ id: string; zoom_meeting_id: string | null }>))
  }
  const meetingIds = meetingIdRows.map(row => row.id)
  const zoomMeetingIds = Array.from(
    new Set(meetingIdRows.map(row => row.zoom_meeting_id).filter((meetingId): meetingId is string => Boolean(meetingId)))
  )

  const participantSyncCount = await countByIds({
    table: 'class_zoom_participant_sync',
    column: 'class_zoom_meeting_id',
    ids: meetingIds,
  })
  const participantCount = await countByIds({ table: 'class_zoom_participant', column: 'class_zoom_meeting_id', ids: meetingIds })

  if (dryRun) {
    return {
      dryRun: true,
      scope,
      classCount: classIds.length,
      meetingCount,
      registrantCount,
      participantSyncCount,
      participantCount,
      attendanceCount,
      attendanceRowsReset: 0,
      meetingsDeleted: 0,
      zoomMeetingsTargeted: zoomMeetingIds.length,
      zoomMeetingsDeleted: 0,
      zoomMeetingDeleteFailures: 0,
      zoomMeetingDeleteFailureDetails: [] as Array<{ meetingId: string; status: number | null; error: string }>,
      ranAt: now.toISOString(),
    }
  }

  let zoomMeetingsDeleted = 0
  let zoomMeetingDeleteFailures = 0
  const zoomMeetingDeleteFailureDetails: Array<{ meetingId: string; status: number | null; error: string }> = []

  for (const meetingId of zoomMeetingIds) {
    try {
      await zoomApiClient.deleteMeeting(meetingId)
      zoomMeetingsDeleted += 1
    } catch (error) {
      if (error instanceof ZoomApiError && error.status === 404) {
        zoomMeetingsDeleted += 1
        continue
      }
      zoomMeetingDeleteFailures += 1
      zoomMeetingDeleteFailureDetails.push({
        meetingId,
        status: error instanceof ZoomApiError ? error.status : null,
        error: error instanceof Error ? error.message : 'Unknown zoom meeting delete error',
      })
    }
  }

  if (zoomMeetingDeleteFailures > 0) {
    return {
      dryRun: false,
      scope,
      classCount: classIds.length,
      meetingCount,
      registrantCount,
      participantSyncCount,
      participantCount,
      attendanceCount,
      attendanceRowsReset: 0,
      meetingsDeleted: 0,
      zoomMeetingsTargeted: zoomMeetingIds.length,
      zoomMeetingsDeleted,
      zoomMeetingDeleteFailures,
      zoomMeetingDeleteFailureDetails,
      aborted: true,
      ranAt: now.toISOString(),
    }
  }

  let meetingsDeleted = 0
  for (const chunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { error, count } = await adminClient
      .from('class_zoom_meeting')
      .delete({ count: 'exact' })
      .in('class_id', chunk)
    if (error) throw new Error(error.message)
    meetingsDeleted += count ?? 0
  }

  let attendanceRowsReset = 0
  for (const chunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { error, count } = await adminClient
      .from('class_attendance')
      .update({
        status: null,
        photo_status: null,
        camera_on: null,
        recorded_by: null,
      }, { count: 'exact' })
      .in('class_id', chunk)
    if (error) throw new Error(error.message)
    attendanceRowsReset += count ?? 0
  }

  return {
    dryRun: false,
    scope,
    classCount: classIds.length,
    meetingCount,
    registrantCount,
    participantSyncCount,
    participantCount,
    attendanceCount,
    attendanceRowsReset,
    meetingsDeleted,
    zoomMeetingsTargeted: zoomMeetingIds.length,
    zoomMeetingsDeleted,
    zoomMeetingDeleteFailures,
    zoomMeetingDeleteFailureDetails,
    aborted: false,
    ranAt: now.toISOString(),
  }
}
