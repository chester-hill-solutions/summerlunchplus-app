import { Form, useActionData, useLoaderData, useNavigation } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { provisionClassById } from '@/lib/zoom-jobs/provision.server'
import { runZoomJobs, runZoomJobsForClass } from '@/lib/zoom-jobs/runner.server'
import type { Route } from './+types/class'
import DeferredTableDisplay from './deferred-table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class')
const baseAction = createTableAction('class')

type ActionData = {
  zoomRunSuccess?: string
  zoomRunError?: string
  classSyncSuccess?: string
  classSyncError?: string
  classMeetingSuccess?: string
  classMeetingError?: string
}

type ClassRow = Record<string, unknown> & {
  id?: string
  workshop_id?: string | null
  starts_at?: string | null
  ends_at?: string | null
}

export async function loader(args: Route.LoaderArgs) {
  const url = new URL(args.request.url)
  const deferTable = url.searchParams.get('_deferTable') === '1'

  if (!deferTable) {
    await requireAuth(args.request)
    return {
      label: 'Classes',
      tableName: 'class',
      columns: [
        'workshop_description',
        'starts_at',
        'step_attendance_rows',
        'step_meeting',
        'step_registrants',
        'step_reminder',
        'step_attendance',
      ],
      rows: [] as Record<string, unknown>[],
      columnMeta: {
        workshop_description: { label: 'Workshop', filterable: true, fitContentOnLoad: true },
        starts_at: { label: 'Timestamp', filterable: true, fitContentOnLoad: true },
        step_meeting: {
          label: 'Meeting',
          filterable: true,
          fitContentOnLoad: true,
          hoverCard: {
            titleField: 'zoom_topic',
            titleFallback: 'Zoom meeting details',
            fields: [
              { label: 'Meeting ID', field: 'class_zoom_meeting_display', fallback: 'Missing' },
              { label: 'Start (UTC)', field: 'zoom_start_at', fallback: 'Missing' },
              { label: 'End (UTC)', field: 'zoom_end_at', fallback: 'Missing' },
              { label: 'Time check', field: 'zoom_schedule_match', fallback: 'Missing' },
              { label: 'Join URL', field: 'zoom_join_url', fallback: 'Missing' },
            ],
          },
        },
        step_registrants: { label: 'Zoom Registrants', filterable: true },
        step_attendance_rows: { label: 'Attendance Rows', filterable: true },
        step_reminder: { label: 'Reminder', filterable: true },
        step_attendance: { label: 'Attendance Sync', filterable: true },
      },
    }
  }

  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as ClassRow[]

  const classIds = Array.from(new Set(rows.map(row => (typeof row.id === 'string' ? row.id : '')).filter(Boolean)))
  const workshopIds = Array.from(new Set(rows.map(row => (typeof row.workshop_id === 'string' ? row.workshop_id : '')).filter(Boolean)))

  if (!classIds.length) return base

  const { supabase } = createClient(args.request)

  const [{ data: meetings }, { data: registrants }, { data: enrollments }, { data: attendanceRows }] = await Promise.all([
    supabase
      .from('class_zoom_meeting')
      .select('id, class_id, status, join_url, host_zoom_user_email, zoom_meeting_id, start_time, duration_minutes, topic')
      .in('class_id', classIds),
    supabase
      .from('class_zoom_registrant')
      .select('class_id, profile_id, zoom_registrant_id, zoom_join_url, last_sent_at')
      .in('class_id', classIds),
    workshopIds.length
      ? supabase
          .from('workshop_enrollment')
          .select('workshop_id, profile_id, status')
          .in('workshop_id', workshopIds)
          .eq('status', 'approved')
      : Promise.resolve({ data: [] as Array<{ workshop_id: string; profile_id: string | null; status: string }> }),
    classIds.length
      ? supabase.from('class_attendance').select('class_id, profile_id').in('class_id', classIds)
      : Promise.resolve({ data: [] as Array<{ class_id: string; profile_id: string | null }> }),
  ])

  const meetingByClassId = new Map<
    string,
    {
      id: string
      status: string
      join_url: string | null
      host_zoom_user_email: string | null
      zoom_meeting_id: string | null
      start_time: string | null
      duration_minutes: number | null
      topic: string | null
    }
  >()
  for (const meeting of meetings ?? []) {
    if (!meeting.class_id || meetingByClassId.has(meeting.class_id)) continue
    meetingByClassId.set(meeting.class_id, {
      id: meeting.id,
      status: meeting.status,
      join_url: meeting.join_url,
      host_zoom_user_email: meeting.host_zoom_user_email,
      zoom_meeting_id: meeting.zoom_meeting_id,
      start_time: meeting.start_time,
      duration_minutes: meeting.duration_minutes,
      topic: meeting.topic,
    })
  }

  const meetingIds = Array.from(new Set(Array.from(meetingByClassId.values()).map(item => item.id)))
  const { data: syncRuns } = meetingIds.length
    ? await supabase
        .from('class_zoom_participant_sync')
        .select('class_zoom_meeting_id, status, created_at')
        .in('class_zoom_meeting_id', meetingIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ class_zoom_meeting_id: string; status: string; created_at: string }> }

  const latestSyncByMeetingId = new Map<string, { status: string; created_at: string }>()
  for (const syncRun of syncRuns ?? []) {
    if (!latestSyncByMeetingId.has(syncRun.class_zoom_meeting_id)) {
      latestSyncByMeetingId.set(syncRun.class_zoom_meeting_id, {
        status: syncRun.status,
        created_at: syncRun.created_at,
      })
    }
  }

  const approvedCountByWorkshopId = new Map<string, number>()
  const approvedProfileIdsByWorkshopId = new Map<string, Set<string>>()
  const seenWorkshopProfile = new Set<string>()
  for (const enrollment of enrollments ?? []) {
    if (!enrollment.workshop_id || !enrollment.profile_id) continue
    const key = `${enrollment.workshop_id}::${enrollment.profile_id}`
    if (seenWorkshopProfile.has(key)) continue
    seenWorkshopProfile.add(key)
    const workshopProfiles = approvedProfileIdsByWorkshopId.get(enrollment.workshop_id) ?? new Set<string>()
    workshopProfiles.add(enrollment.profile_id)
    approvedProfileIdsByWorkshopId.set(enrollment.workshop_id, workshopProfiles)
    approvedCountByWorkshopId.set(enrollment.workshop_id, (approvedCountByWorkshopId.get(enrollment.workshop_id) ?? 0) + 1)
  }

  const attendanceProfileIdsByClassId = new Map<string, Set<string>>()
  for (const row of attendanceRows ?? []) {
    if (!row.class_id || !row.profile_id) continue
    const classProfiles = attendanceProfileIdsByClassId.get(row.class_id) ?? new Set<string>()
    classProfiles.add(row.profile_id)
    attendanceProfileIdsByClassId.set(row.class_id, classProfiles)
  }

  const registrantsByClassId = new Map<
    string,
    Array<{ profile_id: string; zoom_registrant_id: string | null; zoom_join_url: string | null; last_sent_at: string | null }>
  >()
  for (const registrant of registrants ?? []) {
    if (!registrant.class_id || !registrant.profile_id) continue
    const bucket = registrantsByClassId.get(registrant.class_id) ?? []
    bucket.push({
      profile_id: registrant.profile_id,
      zoom_registrant_id: registrant.zoom_registrant_id,
      zoom_join_url: registrant.zoom_join_url,
      last_sent_at: registrant.last_sent_at,
    })
    registrantsByClassId.set(registrant.class_id, bucket)
  }

  const progressLabel = ({ done, total }: { done: number; total: number }) => `${done}/${total}`

  const progressCellClass = ({ done, total }: { done: number; total: number }) =>
    done >= total
      ? 'font-semibold !text-[var(--brand-green)] visited:!text-[var(--brand-green)] hover:!text-[var(--brand-green)]'
      : 'font-semibold !text-destructive visited:!text-destructive hover:!text-destructive'

  const zoomScheduleMatchLabel = ({
    classStartsAt,
    classEndsAt,
    zoomStartsAt,
    zoomDurationMinutes,
  }: {
    classStartsAt: string | null
    classEndsAt: string | null
    zoomStartsAt: string | null
    zoomDurationMinutes: number | null
  }) => {
    if (!classStartsAt || !classEndsAt || !zoomStartsAt || typeof zoomDurationMinutes !== 'number') return 'Missing'

    const classStartMs = new Date(classStartsAt).getTime()
    const classEndMs = new Date(classEndsAt).getTime()
    const zoomStartMs = new Date(zoomStartsAt).getTime()
    const zoomEndMs = zoomStartMs + zoomDurationMinutes * 60_000

    if (!Number.isFinite(classStartMs) || !Number.isFinite(classEndMs) || !Number.isFinite(zoomStartMs)) return 'Invalid'

    const startDeltaMinutes = Math.round(Math.abs(classStartMs - zoomStartMs) / 60_000)
    const endDeltaMinutes = Math.round(Math.abs(classEndMs - zoomEndMs) / 60_000)

    if (startDeltaMinutes <= 1 && endDeltaMinutes <= 1) return 'In sync'
    return `Drift (${startDeltaMinutes}m/${endDeltaMinutes}m)`
  }

  const nextRows = rows.map(row => {
    const classId = typeof row.id === 'string' ? row.id : ''
    const workshopId = typeof row.workshop_id === 'string' ? row.workshop_id : ''
    const meeting = classId ? meetingByClassId.get(classId) : null
    const classRegistrants = classId ? registrantsByClassId.get(classId) ?? [] : []
    const expected = workshopId ? approvedCountByWorkshopId.get(workshopId) ?? 0 : 0
    const expectedProfileIds = workshopId ? approvedProfileIdsByWorkshopId.get(workshopId) ?? new Set<string>() : new Set<string>()
    const attendanceProfileIds = classId ? attendanceProfileIdsByClassId.get(classId) ?? new Set<string>() : new Set<string>()
    const zoomEndAt =
      meeting?.start_time && typeof meeting.duration_minutes === 'number'
        ? new Date(new Date(meeting.start_time).getTime() + meeting.duration_minutes * 60_000).toISOString()
        : ''

    const registrantProfileIds = new Set(
      classRegistrants
        .map(entry => entry.profile_id)
        .filter(profileId => expectedProfileIds.has(profileId))
    )
    const registrantsReady = registrantProfileIds.size
    const attendanceRowsReady = Array.from(expectedProfileIds).filter(profileId => attendanceProfileIds.has(profileId)).length
    const remindersSent = classRegistrants.filter(entry => Boolean(entry.last_sent_at)).length

    const endsAt = typeof row.ends_at === 'string' ? new Date(row.ends_at) : null
    const classEnded = Boolean(endsAt && Number.isFinite(endsAt.getTime()) && endsAt.getTime() <= Date.now())
    const latestSync = meeting ? latestSyncByMeetingId.get(meeting.id) : null

    let attendanceStep = 'Pending'
    if (!meeting || meeting.status !== 'created') {
      attendanceStep = 'Blocked (meeting missing)'
    } else if (!classEnded) {
      attendanceStep = 'Not due yet'
    } else if (!latestSync) {
      attendanceStep = 'Missing'
    } else if (latestSync.status === 'completed') {
      attendanceStep = 'Done'
    } else if (latestSync.status === 'pending' || latestSync.status === 'running') {
      attendanceStep = 'In progress'
    } else {
      attendanceStep = 'Failed'
    }

    const registrantsProgress = { done: registrantsReady, total: expected }
    const attendanceRowsProgress = { done: attendanceRowsReady, total: expected }
    const remindersProgress = { done: remindersSent, total: expected }

    const meetingComplete = Boolean(meeting && meeting.status === 'created' && meeting.join_url)

    return {
      ...row,
      class_zoom_meeting_id: meeting?.id ?? '',
      class_zoom_meeting_display: meeting?.zoom_meeting_id ?? '',
      zoom_topic: meeting?.topic ?? '',
      zoom_start_at: meeting?.start_time ?? '',
      zoom_end_at: zoomEndAt,
      zoom_schedule_match: zoomScheduleMatchLabel({
        classStartsAt: typeof row.starts_at === 'string' ? row.starts_at : null,
        classEndsAt: typeof row.ends_at === 'string' ? row.ends_at : null,
        zoomStartsAt: meeting?.start_time ?? null,
        zoomDurationMinutes: meeting?.duration_minutes ?? null,
      }),
      sync_class: 'Sync class',
      zoom_host_email: meeting?.host_zoom_user_email ?? row.zoom_host_email ?? '',
      zoom_join_url: meeting?.join_url ?? row.zoom_join_url ?? '',
      step_meeting: meetingComplete ? meeting?.start_time ?? 'Generated' : 'Generate',
      step_registrants: progressLabel(registrantsProgress),
      step_attendance_rows: progressLabel(attendanceRowsProgress),
      step_reminder: progressLabel(remindersProgress),
      step_attendance: attendanceStep,
      _cell_class_by_column: {
        ...(row._cell_class_by_column && typeof row._cell_class_by_column === 'object' ? row._cell_class_by_column : {}),
        step_registrants: progressCellClass(registrantsProgress),
        step_attendance_rows: progressCellClass(attendanceRowsProgress),
        step_reminder: progressCellClass(remindersProgress),
      },
    }
  })

  const baseDisplayColumns = (base.columns ?? []).filter(
    column =>
      column !== 'id' &&
      column !== 'class_zoom_meeting_id' &&
      column !== 'class_zoom_meeting_display' &&
      column !== 'ends_at'
  )

  const displayColumns = [...baseDisplayColumns]
  const meetingColumnIndex = displayColumns.indexOf('step_meeting')
  if (meetingColumnIndex !== -1) {
    displayColumns.splice(meetingColumnIndex, 0, 'step_attendance_rows')
  }

  displayColumns.push('ends_at', 'sync_class')

  const fitAllColumnsMeta = Object.fromEntries(
    displayColumns.map(column => [
      column,
      {
        fitContentOnLoad: true,
      },
    ])
  )

  return {
    ...base,
    columns: displayColumns,
    rows: nextRows,
    columnMeta: {
      ...fitAllColumnsMeta,
      ...(base.columnMeta ?? {}),
      workshop_description: {
        label: 'Workshop',
        truncate: true,
        minWidth: 170,
        preferredWidth: 220,
        fitContentOnLoad: true,
      },
      starts_at: {
        label: 'Timestamp',
        minWidth: 210,
        preferredWidth: 260,
        fitContentOnLoad: true,
      },
      ends_at: {
        label: 'Ends at',
        minWidth: 180,
        preferredWidth: 220,
        fitContentOnLoad: true,
      },
      step_meeting: {
        label: 'Meeting',
        filterable: true,
        fitContentOnLoad: true,
        hoverCard: {
          titleField: 'zoom_topic',
          titleFallback: 'Zoom meeting details',
          fields: [
            { label: 'Meeting ID', field: 'class_zoom_meeting_display', fallback: 'Missing' },
            { label: 'Start (UTC)', field: 'zoom_start_at', fallback: 'Missing' },
            { label: 'End (UTC)', field: 'zoom_end_at', fallback: 'Missing' },
            { label: 'Time check', field: 'zoom_schedule_match', fallback: 'Missing' },
            { label: 'Join URL', field: 'zoom_join_url', fallback: 'Missing' },
          ],
        },
      },
      step_registrants: { label: 'Zoom Registrants', filterable: true },
      step_attendance_rows: { label: 'Attendance Rows', filterable: true },
      step_reminder: { label: 'Reminder', filterable: true },
      step_attendance: { label: 'Attendance Sync', filterable: true },
      sync_class: { label: 'Sync', filterable: false },
      zoom_host_email: { label: 'Zoom Host', filterable: true, fitContentOnLoad: true },
      zoom_join_url: { label: 'Zoom Join Link', truncate: true },
    },
  }
}

export async function action(args: Route.ActionArgs) {
  const formData = await args.request.clone().formData()
  const intent = String(formData.get('intent') ?? '')

  if (intent === 'run-zoom-jobs') {
    const auth = await requireAuth(args.request)
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    try {
      const appOrigin = new URL(args.request.url).origin
      await runZoomJobs({
        appOrigin,
        runId: `manual-ui-${Date.now().toString(36)}`,
        triggerSource: 'ui',
        triggerKind: 'zoom_jobs_run',
        actorUserId: auth.user.id,
        actorRole: auth.claims.role,
      })
      return { zoomRunSuccess: 'Zoom provisioning sequence started and completed for this run.' } satisfies ActionData
    } catch (error) {
      return {
        zoomRunError: error instanceof Error ? error.message : 'Failed to run Zoom jobs.',
      } satisfies ActionData
    }
  }

  if (intent === 'sync-class') {
    const auth = await requireAuth(args.request)
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    const classId = String(formData.get('class_id') ?? '')
    if (!classId) {
      return { classSyncError: 'Missing class id.' } satisfies ActionData
    }

    try {
      const appOrigin = new URL(args.request.url).origin
      await runZoomJobsForClass({
        classId,
        appOrigin,
        runId: `manual-class-${Date.now().toString(36)}`,
        triggerSource: 'ui',
        triggerKind: 'sync_button',
        actorUserId: auth.user.id,
        actorRole: auth.claims.role,
      })
      return { classSyncSuccess: `Class sync completed for ${classId}.` } satisfies ActionData
    } catch (error) {
      return {
        classSyncError: error instanceof Error ? error.message : `Failed to sync class ${classId}.`,
      } satisfies ActionData
    }
  }

  if (intent === 'generate-meeting') {
    const auth = await requireAuth(args.request)
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    const classId = String(formData.get('class_id') ?? '')
    if (!classId) {
      return { classMeetingError: 'Missing class id.' } satisfies ActionData
    }

    const runId = `manual-generate-${Date.now().toString(36)}`
    const result = await provisionClassById(classId, {
      lockOwnerRunId: runId,
      lockOwnerKind: 'generate_meeting',
      auditContext: {
        runId,
        triggerSource: 'ui',
        triggerKind: 'generate_meeting_button',
        actorUserId: auth.user.id,
        actorRole: auth.claims.role,
      },
    })

    if (result.error) {
      return {
        classMeetingError: result.error,
      } satisfies ActionData
    }

    if (result.skipped) {
      return {
        classMeetingError: `Meeting generation skipped (${result.skipReason ?? 'unknown'}).`,
      } satisfies ActionData
    }

    return {
      classMeetingSuccess: `Meeting generated for ${classId}.`,
    } satisfies ActionData
  }

  return baseAction(args)
}

export default function ClassTablePage() {
  const data = useLoaderData<typeof loader>()
  const actionData = useActionData<ActionData>()
  const navigation = useNavigation()
  const isRunningZoomJobs =
    navigation.state === 'submitting' &&
    navigation.formData?.get('intent') === 'run-zoom-jobs'

  return (
    <DeferredTableDisplay
      dataPath="/manage/class/table-data"
      fallbackData={data}
      headerActions={
        <div className="flex items-center gap-3">
          <Form method="post">
            <input type="hidden" name="intent" value="run-zoom-jobs" />
            <Button type="submit" disabled={isRunningZoomJobs}>
              {isRunningZoomJobs ? 'Running Zoom jobs...' : 'Run Zoom provisioning now'}
            </Button>
          </Form>
          {actionData?.zoomRunSuccess ? (
            <p className="text-sm text-emerald-700">{actionData.zoomRunSuccess}</p>
          ) : null}
          {actionData?.zoomRunError ? (
            <p className="text-sm text-destructive">{actionData.zoomRunError}</p>
          ) : null}
          {actionData?.classSyncSuccess ? (
            <p className="text-sm text-emerald-700">{actionData.classSyncSuccess}</p>
          ) : null}
          {actionData?.classSyncError ? (
            <p className="text-sm text-destructive">{actionData.classSyncError}</p>
          ) : null}
          {actionData?.classMeetingSuccess ? (
            <p className="text-sm text-emerald-700">{actionData.classMeetingSuccess}</p>
          ) : null}
          {actionData?.classMeetingError ? (
            <p className="text-sm text-destructive">{actionData.classMeetingError}</p>
          ) : null}
        </div>
      }
    />
  )
}
