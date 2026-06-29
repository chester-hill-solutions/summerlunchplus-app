import { Form, useActionData, useNavigation } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { runZoomJobs } from '@/lib/zoom-jobs/runner.server'
import type { Route } from './+types/class'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class')
const baseAction = createTableAction('class')

type ActionData = {
  zoomRunSuccess?: string
  zoomRunError?: string
}

type ClassRow = Record<string, unknown> & {
  id?: string
  workshop_id?: string | null
  ends_at?: string | null
}

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as ClassRow[]

  const classIds = Array.from(new Set(rows.map(row => (typeof row.id === 'string' ? row.id : '')).filter(Boolean)))
  const workshopIds = Array.from(new Set(rows.map(row => (typeof row.workshop_id === 'string' ? row.workshop_id : '')).filter(Boolean)))

  if (!classIds.length) return base

  const { supabase } = createClient(args.request)

  const [{ data: meetings }, { data: registrants }, { data: enrollments }] = await Promise.all([
    supabase
      .from('class_zoom_meeting')
      .select('id, class_id, status, join_url, host_zoom_user_email')
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
  ])

  const meetingByClassId = new Map<string, { id: string; status: string; join_url: string | null; host_zoom_user_email: string | null }>()
  for (const meeting of meetings ?? []) {
    if (!meeting.class_id || meetingByClassId.has(meeting.class_id)) continue
    meetingByClassId.set(meeting.class_id, {
      id: meeting.id,
      status: meeting.status,
      join_url: meeting.join_url,
      host_zoom_user_email: meeting.host_zoom_user_email,
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
  const seenWorkshopProfile = new Set<string>()
  for (const enrollment of enrollments ?? []) {
    if (!enrollment.workshop_id || !enrollment.profile_id) continue
    const key = `${enrollment.workshop_id}::${enrollment.profile_id}`
    if (seenWorkshopProfile.has(key)) continue
    seenWorkshopProfile.add(key)
    approvedCountByWorkshopId.set(enrollment.workshop_id, (approvedCountByWorkshopId.get(enrollment.workshop_id) ?? 0) + 1)
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

  const statusLabel = ({ done, total }: { done: number; total: number }) => {
    if (total <= 0) return 'N/A'
    if (done >= total) return `Done (${done}/${total})`
    if (done <= 0) return `Missing (0/${total})`
    return `Partial (${done}/${total})`
  }

  const nextRows = rows.map(row => {
    const classId = typeof row.id === 'string' ? row.id : ''
    const workshopId = typeof row.workshop_id === 'string' ? row.workshop_id : ''
    const meeting = classId ? meetingByClassId.get(classId) : null
    const classRegistrants = classId ? registrantsByClassId.get(classId) ?? [] : []
    const expected = workshopId ? approvedCountByWorkshopId.get(workshopId) ?? 0 : 0

    const registrantsReady = classRegistrants.filter(
      entry => Boolean(entry.zoom_registrant_id && entry.zoom_join_url)
    ).length
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

    return {
      ...row,
      zoom_host_email: meeting?.host_zoom_user_email ?? row.zoom_host_email ?? '',
      zoom_join_url: meeting?.join_url ?? row.zoom_join_url ?? '',
      step_meeting: meeting && meeting.status === 'created' && meeting.join_url ? 'Done' : 'Missing',
      step_registrants: statusLabel({ done: registrantsReady, total: expected }),
      step_reminder: statusLabel({ done: remindersSent, total: expected }),
      step_attendance: attendanceStep,
    }
  })

  return {
    ...base,
    rows: nextRows,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      step_meeting: { label: 'Step 1: Meeting', filterable: true },
      step_registrants: { label: 'Step 2: Registrants', filterable: true },
      step_reminder: { label: 'Step 3: Reminder', filterable: true },
      step_attendance: { label: 'Step 4: Attendance Sync', filterable: true },
      zoom_host_email: { label: 'Zoom Host', filterable: true },
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
      await runZoomJobs({ appOrigin, runId: `manual-ui-${Date.now().toString(36)}` })
      return { zoomRunSuccess: 'Zoom provisioning sequence started and completed for this run.' } satisfies ActionData
    } catch (error) {
      return {
        zoomRunError: error instanceof Error ? error.message : 'Failed to run Zoom jobs.',
      } satisfies ActionData
    }
  }

  return baseAction(args)
}

export default function ClassTablePage() {
  const actionData = useActionData<ActionData>()
  const navigation = useNavigation()
  const isRunningZoomJobs =
    navigation.state === 'submitting' &&
    navigation.formData?.get('intent') === 'run-zoom-jobs'

  return (
    <TableDisplay
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
        </div>
      }
    />
  )
}
