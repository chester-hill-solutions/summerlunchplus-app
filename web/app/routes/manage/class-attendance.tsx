import { requireAuth } from '@/lib/auth.server'
import { Constants, type Database } from '@/lib/database.types'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'
import { createClient } from '@/lib/supabase/server'
import { runZoomJobsForClass } from '@/lib/zoom-jobs/runner.server'
import type { Route } from './+types/class-attendance'
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

type ClassRow = {
  id: string
  workshop_id: string | null
  starts_at: string
  ends_at: string
}

type WorkshopRow = {
  id: string
  description: string | null
}

type ProfileRow = {
  id: string
  firstname: string | null
  surname: string | null
  email: string | null
}

type MeetingRow = {
  id: string
  class_id: string
  status: string
  error_message: string | null
  last_synced_at: string | null
  zoom_meeting_id: string | null
  topic: string | null
  start_time: string | null
  duration_minutes: number | null
  join_url: string | null
  host_zoom_user_email: string | null
}

type RegistrantRow = {
  class_id: string
  profile_id: string
  zoom_registrant_id: string | null
  zoom_join_url: string | null
  last_sent_at: string | null
}

type SyncRunRow = {
  id: string
  class_zoom_meeting_id: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  payload: unknown
}

const IN_CLAUSE_BATCH_SIZE = 150

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const displayName = (profile: ProfileRow | null) => {
  const first = (profile?.firstname ?? '').trim()
  const last = (profile?.surname ?? '').trim()
  const full = [first, last].filter(Boolean).join(' ').trim()
  if (full) return full
  if (profile?.email) return profile.email
  return ''
}

const displayNameOrId = (profile: ProfileRow | null, fallbackId: string) => {
  const label = displayName(profile)
  return label || `Unknown student (${fallbackId.slice(0, 8)})`
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const { data, error } = await adminClient
    .from('class_attendance')
    .select('id, class_id, profile_id, status, photo_status, camera_on, recorded_by, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Response(error.message, { status: 500 })
  }

  const attendanceRows = (data ?? []) as AttendanceRow[]
  const classIds = Array.from(new Set(attendanceRows.map(row => row.class_id).filter(Boolean)))
  const profileIds = Array.from(new Set(attendanceRows.map(row => row.profile_id).filter(Boolean)))
  const recordedByIds = Array.from(new Set(attendanceRows.map(row => row.recorded_by).filter((id): id is string => Boolean(id))))

  const [{ data: classRows, error: classError }, { data: meetingRows, error: meetingError }, { data: registrantRows, error: registrantError }] =
    await Promise.all([
      classIds.length
        ? adminClient.from('class').select('id, workshop_id, starts_at, ends_at').in('id', classIds)
        : Promise.resolve({ data: [] as ClassRow[], error: null }),
      classIds.length
        ? adminClient
            .from('class_zoom_meeting')
            .select('id, class_id, status, error_message, last_synced_at, zoom_meeting_id, topic, start_time, duration_minutes, join_url, host_zoom_user_email')
            .in('class_id', classIds)
        : Promise.resolve({ data: [] as MeetingRow[], error: null }),
      classIds.length
        ? adminClient
            .from('class_zoom_registrant')
            .select('class_id, profile_id, zoom_registrant_id, zoom_join_url, last_sent_at')
            .in('class_id', classIds)
        : Promise.resolve({ data: [] as RegistrantRow[], error: null }),
    ])

  if (classError) throw new Response(classError.message, { status: 500 })
  if (meetingError) throw new Response(meetingError.message, { status: 500 })
  if (registrantError) throw new Response(registrantError.message, { status: 500 })

  const profilesByIdRows: Array<ProfileRow & { user_id?: string | null }> = []
  for (const chunk of chunkArray(profileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: profileChunk, error: profileError } = await adminClient
      .from('profile')
      .select('id, firstname, surname, email, user_id')
      .in('id', chunk)
    if (profileError) throw new Response(profileError.message, { status: 500 })
    profilesByIdRows.push(...((profileChunk ?? []) as Array<ProfileRow & { user_id?: string | null }>))
  }

  const profilesByUserRows: Array<ProfileRow & { user_id?: string | null }> = []
  for (const chunk of chunkArray(recordedByIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: profileChunk, error: profileError } = await adminClient
      .from('profile')
      .select('id, firstname, surname, email, user_id')
      .in('user_id', chunk)
    if (profileError) throw new Response(profileError.message, { status: 500 })
    profilesByUserRows.push(...((profileChunk ?? []) as Array<ProfileRow & { user_id?: string | null }>))
  }

  const classes = (classRows ?? []) as ClassRow[]
  const workshopsIds = Array.from(new Set(classes.map(row => row.workshop_id).filter((id): id is string => Boolean(id))))
  const meetingIds = Array.from(new Set(((meetingRows ?? []) as MeetingRow[]).map(row => row.id)))

  const [{ data: workshopRows, error: workshopError }, { data: syncRows, error: syncError }] = await Promise.all([
    workshopsIds.length
      ? adminClient.from('workshop').select('id, description').in('id', workshopsIds)
      : Promise.resolve({ data: [] as WorkshopRow[], error: null }),
    meetingIds.length
      ? adminClient
          .from('class_zoom_participant_sync')
          .select('id, class_zoom_meeting_id, status, created_at, started_at, completed_at, error_message, payload')
          .in('class_zoom_meeting_id', meetingIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as SyncRunRow[], error: null }),
  ])

  if (workshopError) throw new Response(workshopError.message, { status: 500 })
  if (syncError) throw new Response(syncError.message, { status: 500 })

  const classById = new Map(classes.map(row => [row.id, row]))
  const workshopById = new Map(((workshopRows ?? []) as WorkshopRow[]).map(row => [row.id, row]))
  const profileRowsTyped = [...profilesByIdRows, ...profilesByUserRows]
  const profileById = new Map(profileRowsTyped.map(row => [row.id, row]))
  const profileByUserId = new Map(
    profileRowsTyped
      .map(row => (typeof row.user_id === 'string' && row.user_id ? [row.user_id, row] : null))
      .filter((entry): entry is [string, ProfileRow & { user_id?: string | null }] => Boolean(entry))
  )

  const meetingByClassId = new Map<string, MeetingRow>()
  for (const row of (meetingRows ?? []) as MeetingRow[]) {
    if (!meetingByClassId.has(row.class_id)) meetingByClassId.set(row.class_id, row)
  }

  const latestSyncByMeetingId = new Map<
    string,
    {
      id: string
      status: string
      created_at: string
      started_at: string | null
      completed_at: string | null
      error_message: string | null
      payload: unknown
    }
  >()
  for (const row of (syncRows ?? []) as SyncRunRow[]) {
    if (!latestSyncByMeetingId.has(row.class_zoom_meeting_id)) {
      latestSyncByMeetingId.set(row.class_zoom_meeting_id, {
        id: row.id,
        status: row.status,
        created_at: row.created_at,
        started_at: row.started_at,
        completed_at: row.completed_at,
        error_message: row.error_message,
        payload: row.payload,
      })
    }
  }

  const registrantsByClassId = new Map<string, RegistrantRow[]>()
  for (const row of (registrantRows ?? []) as RegistrantRow[]) {
    const bucket = registrantsByClassId.get(row.class_id) ?? []
    bucket.push(row)
    registrantsByClassId.set(row.class_id, bucket)
  }

  const rows = attendanceRows.map(row => {
    const classRow = classById.get(row.class_id) ?? null
    const workshop = classRow?.workshop_id ? workshopById.get(classRow.workshop_id) ?? null : null
    const profile = profileById.get(row.profile_id) ?? null
    const meeting = meetingByClassId.get(row.class_id) ?? null
    const registrants = registrantsByClassId.get(row.class_id) ?? []

    const endsAt = classRow?.ends_at ? new Date(classRow.ends_at) : null
    const classEnded = Boolean(endsAt && Number.isFinite(endsAt.getTime()) && endsAt.getTime() <= Date.now())
    const latestSync = meeting ? latestSyncByMeetingId.get(meeting.id) : null

    const zoomEndAt =
      meeting?.start_time && typeof meeting.duration_minutes === 'number'
        ? new Date(new Date(meeting.start_time).getTime() + meeting.duration_minutes * 60_000).toISOString()
        : null

    const studentRegistrant = registrants.find(item => item.profile_id === row.profile_id)
    const registrantReady = Boolean(studentRegistrant?.zoom_registrant_id && studentRegistrant.zoom_join_url)
    const reminderSent = Boolean(studentRegistrant?.last_sent_at)

    let stepAttendanceSync = 'Pending'
    if (!meeting || meeting.status !== 'created') {
      stepAttendanceSync = 'Blocked (meeting missing)'
    } else if (!classEnded) {
      stepAttendanceSync = 'Not due yet'
    } else if (row.status === 'present' || row.status === 'absent') {
      stepAttendanceSync = 'Done'
    } else if (!latestSync) {
      stepAttendanceSync = 'Missing'
    } else if (latestSync.status === 'completed') {
      stepAttendanceSync = 'Pending review'
    } else if (latestSync.status === 'pending' || latestSync.status === 'running') {
      stepAttendanceSync = 'In progress'
    } else {
      stepAttendanceSync = 'Failed'
    }

    const stepMeetingDetail = [
      `status=${meeting?.status ?? 'missing'}`,
      `zoom_meeting_id=${meeting?.zoom_meeting_id ?? 'none'}`,
      `host=${meeting?.host_zoom_user_email ?? 'none'}`,
      `meeting_error=${meeting?.error_message ?? 'none'}`,
      `meeting_last_synced=${meeting?.last_synced_at ?? 'none'}`,
    ].join(' | ')

    const stepRegistrantDetail = [
      `zoom_registrant_id=${studentRegistrant?.zoom_registrant_id ?? 'none'}`,
      `join_url=${studentRegistrant?.zoom_join_url ?? 'none'}`,
      `registrant_last_updated=${studentRegistrant ? 'present' : 'none'}`,
    ].join(' | ')

    const stepReminderDetail = [
      `last_sent_at=${studentRegistrant?.last_sent_at ?? 'none'}`,
      `eligible=${studentRegistrant ? 'yes' : 'no'}`,
    ].join(' | ')

    const latestSyncPayload =
      latestSync?.payload && typeof latestSync.payload === 'object'
        ? JSON.stringify(latestSync.payload)
        : latestSync?.payload == null
          ? ''
          : String(latestSync.payload)

    const stepAttendanceSyncDetail = [
      `sync_status=${latestSync?.status ?? 'none'}`,
      `sync_id=${latestSync?.id ?? 'none'}`,
      `sync_started=${latestSync?.started_at ?? 'none'}`,
      `sync_completed=${latestSync?.completed_at ?? 'none'}`,
      `sync_error=${latestSync?.error_message ?? 'none'}`,
    ].join(' | ')

    return {
      ...row,
      workshop_description: workshop?.description ?? 'Workshop',
      class_starts_at: classRow?.starts_at ?? null,
      class_ends_at: classRow?.ends_at ?? null,
      profile_display: displayNameOrId(profile, row.profile_id),
      student_join_url: studentRegistrant?.zoom_join_url ?? null,
      zoom_meeting_id: meeting?.zoom_meeting_id ?? null,
      zoom_topic: meeting?.topic ?? null,
      zoom_start_at: meeting?.start_time ?? null,
      zoom_end_at: zoomEndAt,
      zoom_host_email: meeting?.host_zoom_user_email ?? null,
      zoom_join_url: meeting?.join_url ?? null,
      step_meeting: meeting && meeting.status === 'created' && meeting.join_url ? 'Done' : 'Missing',
      step_registrants: registrantReady ? 'Done' : 'Missing',
      step_attendance_rows: 'Done',
      step_reminder: reminderSent ? 'Done' : 'Missing',
      step_attendance_sync: stepAttendanceSync,
      step_meeting_detail: stepMeetingDetail,
      step_registrants_detail: stepRegistrantDetail,
      step_reminder_detail: stepReminderDetail,
      step_attendance_sync_detail: stepAttendanceSyncDetail,
      latest_sync_payload: latestSyncPayload,
      latest_sync_error: latestSync?.error_message ?? null,
      recorded_by_email:
        typeof row.recorded_by === 'string' && row.recorded_by
          ? displayName(profileByUserId.get(row.recorded_by) ?? null) || row.recorded_by
          : null,
    }
  })

  rows.sort((left, right) => {
    const leftStart = typeof left.class_starts_at === 'string' ? new Date(left.class_starts_at).getTime() : Number.POSITIVE_INFINITY
    const rightStart = typeof right.class_starts_at === 'string' ? new Date(right.class_starts_at).getTime() : Number.POSITIVE_INFINITY
    if (leftStart !== rightStart) return leftStart - rightStart

    const leftWorkshop = typeof left.workshop_description === 'string' ? left.workshop_description : ''
    const rightWorkshop = typeof right.workshop_description === 'string' ? right.workshop_description : ''
    const workshopCompare = leftWorkshop.localeCompare(rightWorkshop)
    if (workshopCompare !== 0) return workshopCompare

    const leftProfile = typeof left.profile_display === 'string' ? left.profile_display : ''
    const rightProfile = typeof right.profile_display === 'string' ? right.profile_display : ''
    return leftProfile.localeCompare(rightProfile)
  })

  return {
    label: 'Class attendance',
    tableName: 'class-attendance',
    columns: [
      'workshop_description',
      'class_starts_at',
      'class_ends_at',
      'profile_display',
      'status',
      'photo_status',
      'camera_on',
      'student_join_url',
      'zoom_meeting_id',
      'zoom_topic',
      'zoom_start_at',
      'zoom_end_at',
      'zoom_host_email',
      'zoom_join_url',
      'step_meeting',
      'step_registrants',
      'step_attendance_rows',
      'step_reminder',
      'step_attendance_sync',
      'step_meeting_detail',
      'step_registrants_detail',
      'step_reminder_detail',
      'step_attendance_sync_detail',
      'latest_sync_error',
      'latest_sync_payload',
      'recorded_by_email',
      'created_at',
      'updated_at',
      'class_id',
      'profile_id',
      'id',
      'delete_row',
    ],
    rows,
    columnMeta: {
      workshop_description: { label: 'Workshop', filterable: true, fitContentOnLoad: true },
      class_starts_at: { label: 'Class starts', filterable: true, fitContentOnLoad: true },
      class_ends_at: { label: 'Class ends', filterable: true },
      profile_display: { label: 'Profile', filterable: true, fitContentOnLoad: true },
      status: { label: 'Attendance', filterable: true },
      photo_status: { label: 'Photo status', filterable: true },
      camera_on: { label: 'Camera on', filterable: true },
      student_join_url: { label: 'Student join link', truncate: true, filterable: true },
      zoom_meeting_id: { label: 'Zoom meeting ID', filterable: true },
      zoom_topic: { label: 'Zoom topic', truncate: true, filterable: true },
      zoom_start_at: { label: 'Zoom start (UTC)', filterable: true },
      zoom_end_at: { label: 'Zoom end (UTC)', filterable: true },
      zoom_host_email: { label: 'Zoom host', filterable: true },
      zoom_join_url: { label: 'Zoom join URL', truncate: true, filterable: false },
      step_meeting: { label: 'Step 1: Meeting', filterable: true },
      step_registrants: { label: 'Step 2: Zoom registrant', filterable: true },
      step_attendance_rows: { label: 'Step 3: Attendance row', filterable: true },
      step_reminder: { label: 'Step 4: Reminder', filterable: true },
      step_attendance_sync: { label: 'Step 5: Attendance sync', filterable: true },
      step_meeting_detail: { label: 'Step 1 detail', filterable: true, truncate: true },
      step_registrants_detail: { label: 'Step 2 detail', filterable: true, truncate: true },
      step_reminder_detail: { label: 'Step 4 detail', filterable: true, truncate: true },
      step_attendance_sync_detail: { label: 'Step 5 detail', filterable: true, truncate: true },
      latest_sync_error: { label: 'Latest sync error', filterable: true, truncate: true },
      latest_sync_payload: { label: 'Latest sync payload', filterable: false, truncate: true },
      recorded_by_email: { label: 'Recorded by', filterable: true, truncate: true },
      created_at: { label: 'Created', filterable: true },
      updated_at: { label: 'Updated', filterable: true },
      class_id: { label: 'Class ID', filterable: true },
      profile_id: { label: 'Profile ID', filterable: true },
      id: { label: 'Attendance ID', filterable: true },
      delete_row: { label: 'Delete', filterable: false },
    },
    canEditStatus: isRoleAtLeast(auth.claims.role, 'staff'),
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const intent = formData.get('intent') as string | null

  if (intent === 'register-student') {
    const classId = formData.get('class_id') as string
    const profileId = formData.get('profile_id') as string
    if (!classId || !profileId) {
      return {
        ok: false,
        intent: 'register-student',
        class_id: classId,
        profile_id: profileId,
        error: 'Missing identifiers',
      }
    }

    try {
      const [{ data: classRow, error: classError }, { data: profileRow, error: profileError }, { data: registrantBefore, error: registrantBeforeError }] =
        await Promise.all([
          adminClient.from('class').select('workshop_id').eq('id', classId).maybeSingle<{ workshop_id: string | null }>(),
          adminClient.from('profile').select('email').eq('id', profileId).maybeSingle<{ email: string | null }>(),
          adminClient
            .from('class_zoom_registrant')
            .select('zoom_registrant_id, zoom_join_url')
            .eq('class_id', classId)
            .eq('profile_id', profileId)
            .maybeSingle<{ zoom_registrant_id: string | null; zoom_join_url: string | null }>(),
        ])

      if (classError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load class context: ${classError.message}`,
        }
      }

      if (profileError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load profile context: ${profileError.message}`,
        }
      }

      if (registrantBeforeError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load existing registrant context: ${registrantBeforeError.message}`,
        }
      }

      const workshopId = classRow?.workshop_id ?? null
      const { data: approvedEnrollment, error: enrollmentError } = workshopId
        ? await adminClient
            .from('workshop_enrollment')
            .select('id')
            .eq('workshop_id', workshopId)
            .eq('profile_id', profileId)
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle<{ id: string }>()
        : { data: null, error: null }

      if (enrollmentError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to verify approved enrollment: ${enrollmentError.message}`,
        }
      }

      const profileEmail = (profileRow?.email ?? '').trim().toLowerCase()
      const hasProfileEmail = Boolean(profileEmail)

      const { data: guardianEdges, error: guardianEdgeError } = await adminClient
        .from('person_guardian_child')
        .select('guardian_profile_id')
        .eq('child_profile_id', profileId)

      if (guardianEdgeError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load guardian relation context: ${guardianEdgeError.message}`,
        }
      }

      const guardianIds = Array.from(
        new Set((guardianEdges ?? []).map(edge => edge.guardian_profile_id).filter((id): id is string => Boolean(id)))
      )

      const { data: guardians, error: guardianError } = guardianIds.length
        ? await adminClient.from('profile').select('email').in('id', guardianIds)
        : { data: [] as Array<{ email: string | null }>, error: null }

      if (guardianError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load guardian email context: ${guardianError.message}`,
        }
      }

      const guardianEmailCount = (guardians ?? []).filter(guardian => Boolean((guardian.email ?? '').trim().toLowerCase())).length
      const hasGuardianFallbackEmail = guardianEmailCount > 0
      const identitySource = hasProfileEmail ? 'profile' : hasGuardianFallbackEmail ? 'guardian_fallback' : 'none'

      const appOrigin = new URL(request.url).origin
      const runResult = await runZoomJobsForClass({ classId, appOrigin, runId: `manual-row-${Date.now().toString(36)}` })
      const provision = runResult.provision
      const candidateCountFromProvision =
        provision && typeof provision === 'object'
          ? Number('registrantsCreated' in provision ? provision.registrantsCreated : 0) +
            Number('registrantsUpdated' in provision ? provision.registrantsUpdated : 0) +
            Number('registrantsSkipped' in provision ? provision.registrantsSkipped : 0)
          : 0
      const provisionSkipped = Boolean(provision && typeof provision === 'object' && 'skipped' in provision && provision.skipped)
      const provisionSkipReason =
        provision && typeof provision === 'object' && 'skipReason' in provision ? String(provision.skipReason ?? 'none') : 'none'
      const provisionSummary =
        provision && typeof provision === 'object'
          ? [
              `provision_error=${'error' in provision ? String(provision.error ?? 'none') : 'none'}`,
              `meeting_recreated=${'meetingRecreated' in provision ? String(provision.meetingRecreated) : 'n/a'}`,
              `registrants_created=${'registrantsCreated' in provision ? String(provision.registrantsCreated) : 'n/a'}`,
              `registrants_updated=${'registrantsUpdated' in provision ? String(provision.registrantsUpdated) : 'n/a'}`,
              `registrants_skipped=${'registrantsSkipped' in provision ? String(provision.registrantsSkipped) : 'n/a'}`,
              `provision_skipped=${String(provisionSkipped)}`,
              `provision_skip_reason=${provisionSkipReason}`,
            ].join(' | ')
          : 'provision=unknown'

      const { data: registrant, error } = await adminClient
        .from('class_zoom_registrant')
        .select('zoom_registrant_id, zoom_join_url')
        .eq('class_id', classId)
        .eq('profile_id', profileId)
        .maybeSingle<{ zoom_registrant_id: string | null; zoom_join_url: string | null }>()

      if (error) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `${error.message} | ${provisionSummary}`,
          run_result: runResult,
        }
      }

      if (!registrant?.zoom_registrant_id || !registrant.zoom_join_url) {
        const profileApproved = Boolean(approvedEnrollment?.id)
        const registrantBeforeState =
          registrantBefore && (registrantBefore.zoom_registrant_id || registrantBefore.zoom_join_url)
            ? `before_registrant_id=${registrantBefore.zoom_registrant_id ?? 'none'} before_join_url=${registrantBefore.zoom_join_url ?? 'none'}`
            : 'before_registrant=none'
        const registrantAfterState = registrant
          ? `after_registrant_id=${registrant.zoom_registrant_id ?? 'none'} after_join_url=${registrant.zoom_join_url ?? 'none'}`
          : 'after_registrant=none'

        let rootCause = 'unknown_registration_failure'
        if (!workshopId) rootCause = 'class_missing_workshop'
        else if (!profileApproved) rootCause = 'profile_not_approved_for_class_workshop'
        else if (identitySource === 'none') rootCause = 'no_student_or_guardian_email_for_zoom_identity'
        else if (provisionSkipped && provisionSkipReason === 'lock_not_acquired') rootCause = 'class_provision_lock_not_acquired'
        else if (registrant?.zoom_registrant_id && !registrant.zoom_join_url) rootCause = 'zoom_registrant_created_without_join_url'
        else if (!registrant) rootCause = 'registrant_row_not_created_for_profile'

        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: [
            'Register run completed but this student still has no join link.',
            `root_cause=${rootCause}`,
            `candidate_scope=class_wide_approved_profiles`,
            `candidate_count=${candidateCountFromProvision}`,
            `profile_approved_for_class_workshop=${String(profileApproved)}`,
            `identity_source=${identitySource}`,
            `profile_email_present=${String(hasProfileEmail)}`,
            `guardian_email_count=${guardianEmailCount}`,
            registrantBeforeState,
            registrantAfterState,
            provisionSummary,
          ].join(' | '),
          run_result: runResult,
        }
      }

      return {
        ok: true,
        intent: 'register-student',
        class_id: classId,
        profile_id: profileId,
        zoom_join_url: registrant.zoom_join_url,
        message: `Zoom join link created. | ${provisionSummary}`,
        run_result: runResult,
      }
    } catch (error) {
      return {
        ok: false,
        intent: 'register-student',
        class_id: classId,
        profile_id: profileId,
        error: error instanceof Error ? error.message : 'Failed to register student.',
      }
    }
  }

  if (intent === 'delete-attendance-row') {
    const classId = formData.get('class_id') as string
    const profileId = formData.get('profile_id') as string
    if (!classId || !profileId) {
      return new Response('Missing identifiers', { status: 400, headers: auth.headers })
    }

    const { supabase } = createClient(request)
    const { error } = await supabase.from('class_attendance').delete().eq('class_id', classId).eq('profile_id', profileId)

    if (error) {
      return new Response(error.message, { status: 500, headers: auth.headers })
    }

    return {
      ok: true,
      intent: 'delete-attendance-row',
      class_id: classId,
      profile_id: profileId,
    }
  }

  if (intent !== 'update-status' && intent !== 'update-photo-status' && intent !== 'update-camera-on') {
    return new Response('Unsupported action', { status: 400, headers: auth.headers })
  }

  const classId = formData.get('class_id') as string
  const profileId = formData.get('profile_id') as string
  if (!classId || !profileId) {
    return new Response('Missing identifiers', { status: 400, headers: auth.headers })
  }

  const updates: {
    status?: string | null
    photo_status?: string | null
    camera_on?: boolean | null
    recorded_by: string
  } = {
    recorded_by: auth.user.id,
  }

  if (intent === 'update-status') {
    const status = (formData.get('status') as string | null) ?? null
    const allowedStatuses = Constants.public.Enums.class_attendance_status as readonly Database['public']['Enums']['class_attendance_status'][]
    if (status && !allowedStatuses.includes(status as Database['public']['Enums']['class_attendance_status'])) {
      return new Response('Invalid status', { status: 400, headers: auth.headers })
    }
    updates.status = status || null
  }

  if (intent === 'update-photo-status') {
    const photoStatus = (formData.get('photo_status') as string | null) ?? null
    const allowedPhotoStatuses =
      Constants.public.Enums.class_attendance_photo_status as readonly Database['public']['Enums']['class_attendance_photo_status'][]
    if (photoStatus && !allowedPhotoStatuses.includes(photoStatus as Database['public']['Enums']['class_attendance_photo_status'])) {
      return new Response('Invalid photo status', { status: 400, headers: auth.headers })
    }
    updates.photo_status = photoStatus || null
  }

  if (intent === 'update-camera-on') {
    const rawCameraOn = (formData.get('camera_on') as string | null) ?? ''
    if (rawCameraOn === 'true') {
      updates.camera_on = true
    } else if (rawCameraOn === 'false') {
      updates.camera_on = false
    } else {
      updates.camera_on = null
    }
  }

  const { supabase } = createClient(request)
  const { error } = await supabase
    .from('class_attendance')
    .update(updates)
    .eq('class_id', classId)
    .eq('profile_id', profileId)

  if (error) {
    return new Response(error.message, { status: 500, headers: auth.headers })
  }

  return { ok: true }
}

export default function ClassAttendancePage() {
  return <TableDisplay />
}
