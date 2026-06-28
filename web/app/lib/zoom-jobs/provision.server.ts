import { adminClient } from '@/lib/supabase/adminClient'
import { releaseZoomClassLock, tryAcquireZoomClassLock } from '@/lib/zoom-jobs/lock.server'
import { zoomApiClient } from '@/lib/zoom-jobs/zoom-api.client.server'
import { hashZlrToken, newZlrToken } from '@/lib/zoom-jobs/zlr-token.server'

type ClassRow = {
  id: string
  workshop_id: string | null
  starts_at: string
  ends_at: string
  workshop?: { description: string | null } | null
}

type ZoomHostRow = {
  id: string
  zoom_user_id: string | null
  zoom_user_email: string | null
  priority: number
  display_name: string | null
}

type ClassZoomMeetingRow = {
  id: string
  class_id: string
  zoom_host_id: string
  status: 'pending' | 'created' | 'failed' | 'cancelled'
  class?: Array<{ starts_at: string; ends_at: string }> | null
}

type ProfileRow = {
  id: string
  firstname: string | null
  surname: string | null
  email: string | null
}

type ProvisionClassResult = {
  classId: string
  attendanceRowsEnsured: number
  meetingCreated: boolean
  registrantsCreated: number
  registrantsSkipped: number
  skipped?: boolean
  skipReason?: string
  error?: string
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  const aS = new Date(aStart).getTime()
  const aE = new Date(aEnd).getTime()
  const bS = new Date(bStart).getTime()
  const bE = new Date(bEnd).getTime()
  return aS < bE && bS < aE
}

const toDisplayName = (profile: ProfileRow) => {
  const first = (profile.firstname ?? '').trim()
  const last = (profile.surname ?? '').trim()
  return [first, last].filter(Boolean).join(' ').trim()
}

const buildTopic = (classRow: ClassRow) => {
  const workshopName = classRow.workshop?.description?.trim() || 'SummerLunch+ Class'
  const starts = new Date(classRow.starts_at)
  const dateLabel = Number.isNaN(starts.getTime())
    ? classRow.starts_at
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(starts)
  return `${workshopName} - ${dateLabel}`
}

const getApprovedProfilesForClass = async (classRow: ClassRow) => {
  if (!classRow.workshop_id) return [] as ProfileRow[]
  const { data: enrollments, error: enrollmentError } = await adminClient
    .from('workshop_enrollment')
    .select('profile_id')
    .eq('workshop_id', classRow.workshop_id)
    .eq('status', 'approved')
    .not('profile_id', 'is', null)

  if (enrollmentError) throw new Error(enrollmentError.message)
  const profileIds = Array.from(new Set((enrollments ?? []).map(row => row.profile_id).filter((id): id is string => Boolean(id))))
  if (!profileIds.length) return []

  const { data: profiles, error: profileError } = await adminClient
    .from('profile')
    .select('id, firstname, surname, email')
    .in('id', profileIds)

  if (profileError) throw new Error(profileError.message)
  return (profiles ?? []) as ProfileRow[]
}

const ensureAttendanceRowsForClass = async (classId: string, profiles: ProfileRow[]) => {
  const rows = profiles.map(profile => ({ class_id: classId, profile_id: profile.id, status: null }))
  if (!rows.length) return 0
  const { error } = await adminClient.from('class_attendance').upsert(rows, { onConflict: 'class_id,profile_id' })
  if (error) throw new Error(error.message)
  return rows.length
}

const selectAvailableHost = async (classRow: ClassRow) => {
  const { data: hosts, error: hostError } = await adminClient
    .from('zoom_host')
    .select('id, zoom_user_id, zoom_user_email, priority, display_name')
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (hostError) throw new Error(hostError.message)

  const { data: activeMeetings, error: meetingError } = await adminClient
    .from('class_zoom_meeting')
    .select('id, class_id, zoom_host_id, status, class:class_id ( starts_at, ends_at )')
    .in('status', ['pending', 'created'])

  if (meetingError) throw new Error(meetingError.message)

  const hostRows = (hosts ?? []) as ZoomHostRow[]
  const meetingRows = (activeMeetings ?? []) as unknown as ClassZoomMeetingRow[]
  for (const host of hostRows) {
    const isBusy = meetingRows.some(meeting => {
      const classRelation = Array.isArray(meeting.class) ? meeting.class[0] : null
      if (meeting.zoom_host_id !== host.id || !classRelation) return false
      return overlaps(classRow.starts_at, classRow.ends_at, classRelation.starts_at, classRelation.ends_at)
    })
    if (!isBusy) return host
  }

  return null
}

const upsertFailedMeeting = async (classId: string, errorMessage: string) => {
  const { data: existing } = await adminClient
    .from('class_zoom_meeting')
    .select('id, zoom_host_id, host_zoom_user_id, host_zoom_user_email')
    .eq('class_id', classId)
    .maybeSingle()

  if (existing?.id && existing.zoom_host_id) {
    await adminClient
      .from('class_zoom_meeting')
      .update({ status: 'failed', error_message: errorMessage })
      .eq('id', existing.id)
  }
}

const ensureMeetingForClass = async (classRow: ClassRow) => {
  const { data: existingMeeting, error: existingError } = await adminClient
    .from('class_zoom_meeting')
    .select('id, class_id, zoom_host_id, status, zoom_meeting_id, zoom_meeting_uuid')
    .eq('class_id', classRow.id)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existingMeeting?.status === 'created' && existingMeeting.zoom_meeting_id && existingMeeting.zoom_meeting_uuid) {
    return { id: existingMeeting.id, zoom_meeting_id: existingMeeting.zoom_meeting_id, created: false }
  }

  const host = await selectAvailableHost(classRow)
  if (!host) {
    const msg = 'No available Zoom host for class time window.'
    await upsertFailedMeeting(classRow.id, msg)
    throw new Error(msg)
  }

  const durationMinutes = Math.max(1, Math.round((new Date(classRow.ends_at).getTime() - new Date(classRow.starts_at).getTime()) / 60000))
  const createResp = await zoomApiClient.createMeeting({
    topic: buildTopic(classRow),
    start_time: classRow.starts_at,
    duration: durationMinutes,
    ...(host.zoom_user_id ? { host_zoom_user_id: host.zoom_user_id } : {}),
    ...(!host.zoom_user_id && host.zoom_user_email ? { host_zoom_user_email: host.zoom_user_email } : {}),
  })

  const { data: upserted, error: upsertError } = await adminClient
    .from('class_zoom_meeting')
    .upsert(
      {
        class_id: classRow.id,
        zoom_host_id: host.id,
        host_zoom_user_id: host.zoom_user_id,
        host_zoom_user_email: host.zoom_user_email,
        zoom_meeting_id: String(createResp.id),
        zoom_meeting_uuid: createResp.uuid,
        topic: buildTopic(classRow),
        start_time: classRow.starts_at,
        duration_minutes: durationMinutes,
        join_url: createResp.join_url,
        status: 'created',
        error_message: null,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'class_id' }
    )
    .select('id, zoom_meeting_id')
    .single()

  if (upsertError || !upserted?.id || !upserted.zoom_meeting_id) {
    throw new Error(upsertError?.message ?? 'Failed to persist class_zoom_meeting')
  }

  return { id: upserted.id, zoom_meeting_id: upserted.zoom_meeting_id, created: true }
}

const ensureRegistrantsForClass = async ({
  classRow,
  classZoomMeetingId,
  meetingId,
  profiles,
}: {
  classRow: ClassRow
  classZoomMeetingId: string
  meetingId: string
  profiles: ProfileRow[]
}) => {
  const { data: existingRows, error: existingError } = await adminClient
    .from('class_zoom_registrant')
    .select('id, profile_id, zoom_registrant_id, zoom_join_url')
    .eq('class_id', classRow.id)

  if (existingError) throw new Error(existingError.message)
  const existingByProfileId = new Map((existingRows ?? []).map(row => [row.profile_id, row]))

  let created = 0
  let skipped = 0

  for (const profile of profiles) {
    const email = (profile.email ?? '').trim().toLowerCase()
    const existing = existingByProfileId.get(profile.id)
    if (!email) {
      skipped += 1
      continue
    }
    if (existing?.zoom_registrant_id && existing.zoom_join_url) {
      skipped += 1
      continue
    }

    const fullName = toDisplayName(profile)
    const [firstName, ...rest] = fullName ? fullName.split(' ') : ['Student']
    const lastName = rest.join(' ') || 'Participant'

    const registrant = await zoomApiClient.registerParticipant(meetingId, {
      first_name: firstName || 'Student',
      last_name: lastName,
      email,
    })

    const tokenHash = hashZlrToken(newZlrToken())
    const { error: upsertError } = await adminClient.from('class_zoom_registrant').upsert(
      {
        class_id: classRow.id,
        profile_id: profile.id,
        class_zoom_meeting_id: classZoomMeetingId,
        zoom_registrant_id: registrant?.registrant_id ?? null,
        zoom_join_url: registrant?.join_url ?? null,
        zlr_token_hash: tokenHash,
        zlr_expires_at: classRow.ends_at,
      },
      { onConflict: 'class_id,profile_id' }
    )

    if (upsertError) throw new Error(upsertError.message)
    created += 1
  }

  return { created, skipped }
}

export const provisionClassById = async (classId: string): Promise<ProvisionClassResult> => {
  const lockAcquired = await tryAcquireZoomClassLock(classId)
  if (!lockAcquired) {
    return {
      classId,
      attendanceRowsEnsured: 0,
      meetingCreated: false,
      registrantsCreated: 0,
      registrantsSkipped: 0,
      skipped: true,
      skipReason: 'lock_not_acquired',
    }
  }

  const { data: classRowRaw, error: classError } = await adminClient
    .from('class')
    .select('id, workshop_id, starts_at, ends_at, workshop:workshop_id ( description )')
    .eq('id', classId)
    .single()

  if (classError || !classRowRaw) {
    await releaseZoomClassLock(classId)
    return { classId, attendanceRowsEnsured: 0, meetingCreated: false, registrantsCreated: 0, registrantsSkipped: 0, error: classError?.message ?? 'Class not found' }
  }

  const classRow = classRowRaw as unknown as ClassRow

  try {
    const profiles = await getApprovedProfilesForClass(classRow)
    const attendanceRowsEnsured = await ensureAttendanceRowsForClass(classId, profiles)
    const meeting = await ensureMeetingForClass(classRow)
    const registrants = await ensureRegistrantsForClass({
      classRow,
      classZoomMeetingId: meeting.id,
      meetingId: meeting.zoom_meeting_id,
      profiles,
    })

    return {
      classId,
      attendanceRowsEnsured,
      meetingCreated: meeting.created,
      registrantsCreated: registrants.created,
      registrantsSkipped: registrants.skipped,
    }
  } catch (error) {
    return {
      classId,
      attendanceRowsEnsured: 0,
      meetingCreated: false,
      registrantsCreated: 0,
      registrantsSkipped: 0,
      error: error instanceof Error ? error.message : 'Unknown provisioning error',
    }
  } finally {
    await releaseZoomClassLock(classId)
  }
}

export const getClassesInWindow = async ({
  startsAt,
  endsAt,
}: {
  startsAt: string
  endsAt: string
}) => {
  const { data, error } = await adminClient
    .from('class')
    .select('id')
    .gte('starts_at', startsAt)
    .lt('starts_at', endsAt)
    .order('starts_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map(row => row.id)
}
