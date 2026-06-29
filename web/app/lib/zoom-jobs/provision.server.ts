import { createHash, randomBytes } from 'node:crypto'

import { adminClient } from '@/lib/supabase/adminClient'
import { zoomApiClient } from '@/lib/zoom-jobs/zoom-api.client.server'

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

type ExistingMeeting = {
  id: string
  class_id: string
  zoom_host_id: string
  status: 'pending' | 'created' | 'failed' | 'cancelled'
  zoom_meeting_id: string | null
  zoom_meeting_uuid: string | null
  start_time: string | null
  duration_minutes: number | null
  topic: string | null
}

type ProfileRow = {
  id: string
  firstname: string | null
  surname: string | null
  email: string | null
  updated_at: string | null
}

type ProfileIdentity = {
  profileId: string
  firstName: string
  lastName: string
  email: string
  source: 'profile' | 'guardian_fallback'
  profileUpdatedAt: string | null
}

type ProvisionClassResult = {
  classId: string
  attendanceRowsEnsured: number
  meetingCreated: boolean
  meetingRecreated: boolean
  registrantsCreated: number
  registrantsUpdated: number
  registrantsRemoved: number
  registrantsSkipped: number
  error?: string
}

type ProvisionOptions = {
  forceMeetingRecreate?: boolean
  excludedHostIds?: string[]
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  const aS = new Date(aStart).getTime()
  const aE = new Date(aEnd).getTime()
  const bS = new Date(bStart).getTime()
  const bE = new Date(bEnd).getTime()
  return aS < bE && bS < aE
}

const toDisplayName = (profile: Pick<ProfileRow, 'firstname' | 'surname'>) => {
  const first = (profile.firstname ?? '').trim()
  const last = (profile.surname ?? '').trim()
  return [first, last].filter(Boolean).join(' ').trim()
}

const normalizeEmail = (value: string | null) => (value ?? '').trim().toLowerCase()

const randomToken = () => randomBytes(24).toString('base64url')

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

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

  const profileIds = Array.from(
    new Set((enrollments ?? []).map(row => row.profile_id).filter((id): id is string => Boolean(id)))
  )
  if (!profileIds.length) return []

  const { data: profiles, error: profileError } = await adminClient
    .from('profile')
    .select('id, firstname, surname, email, updated_at')
    .in('id', profileIds)

  if (profileError) throw new Error(profileError.message)
  return (profiles ?? []) as ProfileRow[]
}

const getGuardianFallbackIdentities = async (profileIds: string[]) => {
  if (!profileIds.length) return new Map<string, ProfileIdentity>()

  const { data: edges, error: edgeError } = await adminClient
    .from('person_guardian_child')
    .select('guardian_profile_id, child_profile_id, primary_child')
    .in('child_profile_id', profileIds)

  if (edgeError) throw new Error(edgeError.message)

  const guardianIds = Array.from(
    new Set((edges ?? []).map(edge => edge.guardian_profile_id).filter((id): id is string => Boolean(id)))
  )
  if (!guardianIds.length) return new Map<string, ProfileIdentity>()

  const { data: guardians, error: guardianError } = await adminClient
    .from('profile')
    .select('id, firstname, surname, email, updated_at')
    .in('id', guardianIds)

  if (guardianError) throw new Error(guardianError.message)

  const guardianById = new Map((guardians ?? []).map(guardian => [guardian.id, guardian]))
  const fallbackByChild = new Map<string, ProfileIdentity>()

  const sortedEdges = [...(edges ?? [])].sort((a, b) => {
    if (a.primary_child && !b.primary_child) return -1
    if (!a.primary_child && b.primary_child) return 1
    return a.guardian_profile_id.localeCompare(b.guardian_profile_id)
  })

  for (const edge of sortedEdges) {
    if (fallbackByChild.has(edge.child_profile_id)) continue
    const guardian = guardianById.get(edge.guardian_profile_id)
    if (!guardian) continue
    const email = normalizeEmail(guardian.email)
    if (!email) continue

    const fullName = toDisplayName(guardian)
    const [firstName, ...rest] = fullName ? fullName.split(' ') : ['Family']
    const lastName = rest.join(' ').trim() || 'Contact'

    fallbackByChild.set(edge.child_profile_id, {
      profileId: edge.child_profile_id,
      firstName: firstName || 'Family',
      lastName,
      email,
      source: 'guardian_fallback',
      profileUpdatedAt: guardian.updated_at ?? null,
    })
  }

  return fallbackByChild
}

const buildIdentities = async (profiles: ProfileRow[]) => {
  const identities = new Map<string, ProfileIdentity>()
  const missingEmailProfileIds: string[] = []

  for (const profile of profiles) {
    const email = normalizeEmail(profile.email)
    const fullName = toDisplayName(profile)
    const [firstName, ...rest] = fullName ? fullName.split(' ') : ['Student']
    const lastName = rest.join(' ').trim() || 'Participant'

    if (!email) {
      missingEmailProfileIds.push(profile.id)
      continue
    }

    identities.set(profile.id, {
      profileId: profile.id,
      firstName: firstName || 'Student',
      lastName,
      email,
      source: 'profile',
      profileUpdatedAt: profile.updated_at ?? null,
    })
  }

  const fallbacks = await getGuardianFallbackIdentities(missingEmailProfileIds)
  for (const [profileId, identity] of fallbacks.entries()) {
    identities.set(profileId, identity)
  }

  return identities
}

const ensureAttendanceRowsForClass = async (classId: string, profileIds: string[]) => {
  const rows = profileIds.map(profileId => ({ class_id: classId, profile_id: profileId, status: null }))
  if (!rows.length) return 0
  const { error } = await adminClient.from('class_attendance').upsert(rows, { onConflict: 'class_id,profile_id' })
  if (error) throw new Error(error.message)
  return rows.length
}

const selectAvailableHost = async ({
  classRow,
  excludeMeetingId,
  excludedHostIds,
}: {
  classRow: ClassRow
  excludeMeetingId?: string
  excludedHostIds?: string[]
}) => {
  const excludedHostSet = new Set((excludedHostIds ?? []).filter(Boolean))

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
  const meetingRows = (activeMeetings ?? []) as Array<{
    id: string
    class_id: string
    zoom_host_id: string
    status: string
    class: Array<{ starts_at: string; ends_at: string }> | null
  }>

  for (const host of hostRows) {
    if (excludedHostSet.has(host.id)) continue

    const isBusy = meetingRows.some(meeting => {
      if (excludeMeetingId && meeting.id === excludeMeetingId) return false
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
    .select('id, zoom_host_id')
    .eq('class_id', classId)
    .maybeSingle()

  if (existing?.id && existing.zoom_host_id) {
    await adminClient
      .from('class_zoom_meeting')
      .update({ status: 'failed', error_message: errorMessage })
      .eq('id', existing.id)
  }
}

const isMeetingScheduleOutOfSync = ({
  existingStart,
  existingDuration,
  existingTopic,
  nextStart,
  nextDuration,
  nextTopic,
}: {
  existingStart: string | null | undefined
  existingDuration: number | null | undefined
  existingTopic: string | null | undefined
  nextStart: string
  nextDuration: number
  nextTopic: string
}) => {
  const existingStartMs = existingStart ? new Date(existingStart).getTime() : Number.NaN
  const nextStartMs = new Date(nextStart).getTime()
  const startOutOfSync =
    !Number.isFinite(existingStartMs) || !Number.isFinite(nextStartMs) || Math.abs(existingStartMs - nextStartMs) > 60_000
  const durationOutOfSync = typeof existingDuration !== 'number' || existingDuration !== nextDuration
  const topicOutOfSync = (existingTopic ?? '').trim() !== nextTopic.trim()
  return startOutOfSync || durationOutOfSync || topicOutOfSync
}

const ensureMeetingForClass = async ({
  classRow,
  forceMeetingRecreate = false,
  excludedHostIds,
}: {
  classRow: ClassRow
  forceMeetingRecreate?: boolean
  excludedHostIds?: string[]
}) => {
  const desiredTopic = buildTopic(classRow)
  const durationMinutes = Math.max(
    1,
    Math.round((new Date(classRow.ends_at).getTime() - new Date(classRow.starts_at).getTime()) / 60000)
  )

  const { data: existingMeeting, error: existingError } = await adminClient
    .from('class_zoom_meeting')
    .select('id, class_id, zoom_host_id, status, zoom_meeting_id, zoom_meeting_uuid, start_time, duration_minutes, topic')
    .eq('class_id', classRow.id)
    .maybeSingle<ExistingMeeting>()

  if (existingError) throw new Error(existingError.message)

  if (
    existingMeeting?.status === 'created' &&
    existingMeeting.zoom_meeting_id &&
    existingMeeting.zoom_meeting_uuid &&
    !forceMeetingRecreate
  ) {
    if (
      isMeetingScheduleOutOfSync({
        existingStart: existingMeeting.start_time,
        existingDuration: existingMeeting.duration_minutes,
        existingTopic: existingMeeting.topic,
        nextStart: classRow.starts_at,
        nextDuration: durationMinutes,
        nextTopic: desiredTopic,
      })
    ) {
      await zoomApiClient.updateMeeting(existingMeeting.zoom_meeting_id, {
        topic: desiredTopic,
        start_time: classRow.starts_at,
        duration: durationMinutes,
      })

      const { error: updateError } = await adminClient
        .from('class_zoom_meeting')
        .update({
          topic: desiredTopic,
          start_time: classRow.starts_at,
          duration_minutes: durationMinutes,
          error_message: null,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', existingMeeting.id)

      if (updateError) throw new Error(updateError.message)
    }

    return {
      id: existingMeeting.id,
      zoom_meeting_id: existingMeeting.zoom_meeting_id,
      created: false,
      recreated: false,
      zoom_host_id: existingMeeting.zoom_host_id,
    }
  }

  const host = await selectAvailableHost({
    classRow,
    excludeMeetingId: existingMeeting?.id,
    excludedHostIds,
  })

  if (!host) {
    const msg = 'No available Zoom host for class time window.'
    await upsertFailedMeeting(classRow.id, msg)
    throw new Error(msg)
  }

  const createResp = await zoomApiClient.createMeeting({
    topic: desiredTopic,
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
        topic: desiredTopic,
        start_time: classRow.starts_at,
        duration_minutes: durationMinutes,
        join_url: createResp.join_url,
        status: 'created',
        error_message: null,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'class_id' }
    )
    .select('id, zoom_meeting_id, zoom_host_id')
    .single<{ id: string; zoom_meeting_id: string; zoom_host_id: string }>()

  if (upsertError || !upserted?.id || !upserted.zoom_meeting_id) {
    throw new Error(upsertError?.message ?? 'Failed to persist class_zoom_meeting')
  }

  return {
    id: upserted.id,
    zoom_meeting_id: upserted.zoom_meeting_id,
    created: !existingMeeting,
    recreated: Boolean(existingMeeting),
    zoom_host_id: upserted.zoom_host_id,
  }
}

const ensureRegistrantsForClass = async ({
  classRow,
  classZoomMeetingId,
  meetingId,
  identities,
  forceReregister,
}: {
  classRow: ClassRow
  classZoomMeetingId: string
  meetingId: string
  identities: Map<string, ProfileIdentity>
  forceReregister: boolean
}) => {
  const { data: existingRows, error: existingError } = await adminClient
    .from('class_zoom_registrant')
    .select('id, profile_id, zoom_registrant_id, zoom_join_url, class_zoom_meeting_id, updated_at, class_zoom_meeting:class_zoom_meeting_id ( zoom_meeting_id )')
    .eq('class_id', classRow.id)

  if (existingError) throw new Error(existingError.message)

  const existingByProfileId = new Map(
    (existingRows ?? []).map(row => [
      row.profile_id,
      {
        ...row,
        zoom_meeting_id:
          Array.isArray(row.class_zoom_meeting) && row.class_zoom_meeting[0]?.zoom_meeting_id
            ? row.class_zoom_meeting[0].zoom_meeting_id
            : null,
      },
    ])
  )

  const eligibleProfileIds = new Set(Array.from(identities.keys()))

  let created = 0
  let updated = 0
  let removed = 0
  let skipped = 0

  for (const row of existingRows ?? []) {
    const profileId = row.profile_id
    if (!profileId || eligibleProfileIds.has(profileId)) continue

    if (row.zoom_registrant_id && Array.isArray(row.class_zoom_meeting) && row.class_zoom_meeting[0]?.zoom_meeting_id) {
      try {
        await zoomApiClient.removeRegistrant(row.class_zoom_meeting[0].zoom_meeting_id, row.zoom_registrant_id)
      } catch (error) {
        console.error('[zoom-jobs][registrant] failed to remove stale registrant from zoom', {
          classId: classRow.id,
          profileId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    await adminClient.from('class_zoom_registrant').delete().eq('id', row.id)
    await adminClient.from('class_attendance').delete().eq('class_id', classRow.id).eq('profile_id', profileId)
    removed += 1
  }

  for (const identity of identities.values()) {
    const existing = existingByProfileId.get(identity.profileId)
    const mustReregister =
      forceReregister ||
      !existing?.zoom_registrant_id ||
      !existing.zoom_join_url ||
      existing.class_zoom_meeting_id !== classZoomMeetingId ||
      (identity.profileUpdatedAt && existing.updated_at && new Date(identity.profileUpdatedAt).getTime() > new Date(existing.updated_at).getTime())

    if (!mustReregister) {
      skipped += 1
      continue
    }

    if (existing?.zoom_registrant_id && existing.zoom_meeting_id) {
      try {
        await zoomApiClient.removeRegistrant(existing.zoom_meeting_id, existing.zoom_registrant_id)
      } catch (error) {
        console.error('[zoom-jobs][registrant] failed to remove previous registrant before refresh', {
          classId: classRow.id,
          profileId: identity.profileId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const registrant = await zoomApiClient.registerParticipant(meetingId, {
      first_name: identity.firstName,
      last_name: identity.lastName,
      email: identity.email,
    })

    const tokenHash = sha256(randomToken())
    const { error: upsertError } = await adminClient.from('class_zoom_registrant').upsert(
      {
        class_id: classRow.id,
        profile_id: identity.profileId,
        class_zoom_meeting_id: classZoomMeetingId,
        zoom_registrant_id: registrant?.registrant_id ?? null,
        zoom_join_url: registrant?.join_url ?? null,
        zlr_token_hash: tokenHash,
        zlr_expires_at: classRow.ends_at,
      },
      { onConflict: 'class_id,profile_id' }
    )

    if (upsertError) throw new Error(upsertError.message)

    if (existing) {
      updated += 1
    } else {
      created += 1
    }
  }

  return { created, updated, removed, skipped }
}

export const provisionClassById = async (classId: string, options: ProvisionOptions = {}): Promise<ProvisionClassResult> => {
  const { data: classRowRaw, error: classError } = await adminClient
    .from('class')
    .select('id, workshop_id, starts_at, ends_at, workshop:workshop_id ( description )')
    .eq('id', classId)
    .single()

  if (classError || !classRowRaw) {
    return {
      classId,
      attendanceRowsEnsured: 0,
      meetingCreated: false,
      meetingRecreated: false,
      registrantsCreated: 0,
      registrantsUpdated: 0,
      registrantsRemoved: 0,
      registrantsSkipped: 0,
      error: classError?.message ?? 'Class not found',
    }
  }

  const classRow = classRowRaw as unknown as ClassRow

  try {
    const profiles = await getApprovedProfilesForClass(classRow)
    const identities = await buildIdentities(profiles)
    const attendanceRowsEnsured = await ensureAttendanceRowsForClass(classId, Array.from(identities.keys()))

    const meeting = await ensureMeetingForClass({
      classRow,
      forceMeetingRecreate: Boolean(options.forceMeetingRecreate),
      excludedHostIds: options.excludedHostIds,
    })

    const registrants = await ensureRegistrantsForClass({
      classRow,
      classZoomMeetingId: meeting.id,
      meetingId: meeting.zoom_meeting_id,
      identities,
      forceReregister: meeting.recreated,
    })

    return {
      classId,
      attendanceRowsEnsured,
      meetingCreated: meeting.created,
      meetingRecreated: meeting.recreated,
      registrantsCreated: registrants.created,
      registrantsUpdated: registrants.updated,
      registrantsRemoved: registrants.removed,
      registrantsSkipped: registrants.skipped,
    }
  } catch (error) {
    return {
      classId,
      attendanceRowsEnsured: 0,
      meetingCreated: false,
      meetingRecreated: false,
      registrantsCreated: 0,
      registrantsUpdated: 0,
      registrantsRemoved: 0,
      registrantsSkipped: 0,
      error: error instanceof Error ? error.message : 'Unknown provisioning error',
    }
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

export const getClassesStartingAtOrAfter = async ({
  startsAt,
}: {
  startsAt: string
}) => {
  const { data, error } = await adminClient
    .from('class')
    .select('id')
    .gte('starts_at', startsAt)
    .order('starts_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map(row => row.id)
}
