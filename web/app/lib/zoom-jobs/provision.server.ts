import { adminClient } from '@/lib/supabase/adminClient'
import {
  appendZoomJobAttemptEvent,
  finishZoomJobAttemptAudit,
  startZoomJobAttemptAudit,
  type ZoomAuditContext,
} from '@/lib/zoom-jobs/audit.server'
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
  registrantFailures: Array<{ profileId: string; email: string; error: string }>
  scope: 'class' | 'profile'
  targetProfileId: string | null
  lockOwnerRunId: string
  lockBlockedByOwnerRunId: string | null
  lockBlockedByOwnerKind: string | null
  lockBlockedByOwnerInstance: string | null
  lockBlockedExpiresAt: string | null
  lockTtlRemainingMs: number | null
  lockWaitMs: number
  skipped?: boolean
  skipReason?: string
  error?: string
}

type ProvisionOptions = {
  forceMeetingRecreate?: boolean
  excludedHostIds?: string[]
  targetProfileId?: string
  lockOwnerRunId?: string
  lockOwnerKind?: string
  lockRetryMs?: number
  auditContext?: ZoomAuditContext
}

type ClassScheduleRelation = { starts_at: string; ends_at: string }

const relationRow = <T extends Record<string, unknown>>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null
  if (value && typeof value === 'object') return value
  return null
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

const wait = async (ms: number) => {
  if (ms <= 0) return
  await new Promise(resolve => setTimeout(resolve, ms))
}

const zoomMeetingPrefix = (process.env.ZOOM_MEETING_PREFIX ?? '').trim()

const buildTopic = (classRow: ClassRow) => {
  const workshopName = classRow.workshop?.description?.trim() || 'SummerLunch+ Class'
  const starts = new Date(classRow.starts_at)
  const dateLabel = Number.isNaN(starts.getTime())
    ? classRow.starts_at
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(starts)
  const baseTopic = `${workshopName} - ${dateLabel}`
  return zoomMeetingPrefix ? `${zoomMeetingPrefix} ${baseTopic}` : baseTopic
}

const toZoomUtcStartTime = (value: string) => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid class start timestamp: ${value}`)
  }
  return date.toISOString().replace('.000Z', 'Z')
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

const getGuardianFallbackIdentities = async ({
  profileIds,
  profilesById,
}: {
  profileIds: string[]
  profilesById: Map<string, ProfileRow>
}) => {
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
    const child = profilesById.get(edge.child_profile_id)
    const email = normalizeEmail(guardian.email)
    if (!email) continue

    const childFullName = child ? toDisplayName(child) : ''
    const [firstName, ...rest] = childFullName ? childFullName.split(' ') : ['Student']
    const lastName = rest.join(' ').trim() || 'Participant'
    const profileUpdatedAt = [child?.updated_at ?? null, guardian.updated_at ?? null]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null

    fallbackByChild.set(edge.child_profile_id, {
      profileId: edge.child_profile_id,
      firstName: firstName || 'Student',
      lastName,
      email,
      source: 'guardian_fallback',
      profileUpdatedAt,
    })
  }

  return fallbackByChild
}

const buildIdentities = async (profiles: ProfileRow[]) => {
  const identities = new Map<string, ProfileIdentity>()
  const missingEmailProfileIds: string[] = []
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]))

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

  const fallbacks = await getGuardianFallbackIdentities({
    profileIds: missingEmailProfileIds,
    profilesById,
  })
  for (const [profileId, identity] of fallbacks.entries()) {
    identities.set(profileId, identity)
  }

  return identities
}

const ensureAttendanceRowsForClass = async (classId: string, profileIds: string[]) => {
  if (!profileIds.length) return 0

  const { data: existingRows, error: existingError } = await adminClient
    .from('class_attendance')
    .select('profile_id')
    .eq('class_id', classId)
    .in('profile_id', profileIds)

  if (existingError) throw new Error(existingError.message)

  const existingProfileIds = new Set((existingRows ?? []).map(row => row.profile_id).filter((id): id is string => Boolean(id)))
  const missingProfileIds = profileIds.filter(profileId => !existingProfileIds.has(profileId))
  if (!missingProfileIds.length) return 0

  const rows = missingProfileIds.map(profileId => ({ class_id: classId, profile_id: profileId }))
  const { error } = await adminClient.from('class_attendance').upsert(rows, { onConflict: 'class_id,profile_id' })
  if (error) throw new Error(error.message)

  return missingProfileIds.length
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
    class: ClassScheduleRelation | ClassScheduleRelation[] | null
  }>

  for (const host of hostRows) {
    if (excludedHostSet.has(host.id)) continue

    const isBusy = meetingRows.some(meeting => {
      if (excludeMeetingId && meeting.id === excludeMeetingId) return false
      const classRelation = relationRow<ClassScheduleRelation>(meeting.class)
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
  auditContext,
}: {
  classRow: ClassRow
  forceMeetingRecreate?: boolean
  excludedHostIds?: string[]
  auditContext?: ZoomAuditContext
}) => {
  const meetingAttempt = await startZoomJobAttemptAudit({
    runDbId: auditContext?.runDbId,
    runId: auditContext?.runId ?? 'missing-run-id',
    actionType: 'meeting_generate',
    triggerSource: auditContext?.triggerSource ?? 'unknown',
    triggerKind: auditContext?.triggerKind ?? 'unknown',
    classId: classRow.id,
    requestPayload: {
      classId: classRow.id,
      forceMeetingRecreate,
      excludedHostIds: excludedHostIds ?? [],
    },
  })

  const desiredTopic = buildTopic(classRow)
  const zoomStartTime = toZoomUtcStartTime(classRow.starts_at)
  const durationMinutes = Math.max(
    1,
    Math.round((new Date(classRow.ends_at).getTime() - new Date(classRow.starts_at).getTime()) / 60000)
  )

  try {
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
      let updatedMeeting = false
      let updateResponse: { ok: boolean } | null = null
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
        updateResponse = await zoomApiClient.updateMeeting(existingMeeting.zoom_meeting_id, {
          topic: desiredTopic,
          start_time: zoomStartTime,
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
        updatedMeeting = true
      }

      await finishZoomJobAttemptAudit(meetingAttempt, {
        id: meetingAttempt?.id ?? '',
        status: 'succeeded',
        resultPayload: {
          classZoomMeetingId: existingMeeting.id,
          zoomMeetingId: existingMeeting.zoom_meeting_id,
          created: false,
          recreated: false,
          updatedMeeting,
        },
        externalResponsePayload: updateResponse ? { updateMeeting: updateResponse } : {},
      })

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

    const createRequestPayload = {
      topic: desiredTopic,
      start_time: zoomStartTime,
      duration: durationMinutes,
      ...(host.zoom_user_id ? { host_zoom_user_id: host.zoom_user_id } : {}),
      ...(!host.zoom_user_id && host.zoom_user_email ? { host_zoom_user_email: host.zoom_user_email } : {}),
    }
    const createResp = await zoomApiClient.createMeeting(createRequestPayload)

    if (meetingAttempt) {
      await appendZoomJobAttemptEvent({
        attemptId: meetingAttempt.id,
        eventType: 'zoom_create_meeting_response',
        payload: createResp as Record<string, unknown>,
      })
    }

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

    await finishZoomJobAttemptAudit(meetingAttempt, {
      id: meetingAttempt?.id ?? '',
      status: 'succeeded',
      resultPayload: {
        classZoomMeetingId: upserted.id,
        zoomMeetingId: upserted.zoom_meeting_id,
        created: !existingMeeting,
        recreated: Boolean(existingMeeting),
      },
      externalResponsePayload: createResp as Record<string, unknown>,
    })

    return {
      id: upserted.id,
      zoom_meeting_id: upserted.zoom_meeting_id,
      created: !existingMeeting,
      recreated: Boolean(existingMeeting),
      zoom_host_id: upserted.zoom_host_id,
    }
  } catch (error) {
    await finishZoomJobAttemptAudit(meetingAttempt, {
      id: meetingAttempt?.id ?? '',
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown meeting generation error',
      errorPayload: {
        name: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    throw error
  }
}

const ensureRegistrantsForClass = async ({
  classRow,
  classZoomMeetingId,
  meetingId,
  identities,
  approvedProfileIds,
  forceReregister,
  targetProfileId,
  auditContext,
}: {
  classRow: ClassRow
  classZoomMeetingId: string
  meetingId: string
  identities: Map<string, ProfileIdentity>
  approvedProfileIds: Set<string>
  forceReregister: boolean
  targetProfileId?: string | null
  auditContext?: ZoomAuditContext
}) => {
  const registrantBatchAttempt = await startZoomJobAttemptAudit({
    runDbId: auditContext?.runDbId,
    runId: auditContext?.runId ?? 'missing-run-id',
    actionType: 'registrant_register_batch',
    triggerSource: auditContext?.triggerSource ?? 'unknown',
    triggerKind: auditContext?.triggerKind ?? 'unknown',
    classId: classRow.id,
    classZoomMeetingId,
    requestPayload: {
      classId: classRow.id,
      classZoomMeetingId,
      forceReregister,
      targetProfileId,
      candidateCount: identities.size,
    },
  })

  try {
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
        zoom_meeting_id: relationRow<{ zoom_meeting_id: string | null }>(row.class_zoom_meeting)?.zoom_meeting_id ?? null,
      },
    ])
  )

  let created = 0
  let updated = 0
  let removed = 0
  let skipped = 0
  const failures: Array<{ profileId: string; email: string; error: string }> = []

    if (!targetProfileId) {
    for (const row of existingRows ?? []) {
      const profileId = row.profile_id
      if (!profileId || approvedProfileIds.has(profileId)) continue

      const existingMeeting = relationRow<{ zoom_meeting_id: string | null }>(row.class_zoom_meeting)
      if (row.zoom_registrant_id && existingMeeting?.zoom_meeting_id) {
        try {
          await zoomApiClient.removeRegistrant(existingMeeting.zoom_meeting_id, row.zoom_registrant_id)
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
  }

    for (const identity of identities.values()) {
    if (targetProfileId && identity.profileId !== targetProfileId) continue

      const existing = existingByProfileId.get(identity.profileId)
      const mustReregister =
        forceReregister ||
        !existing?.zoom_registrant_id ||
        !existing.zoom_join_url ||
        existing.class_zoom_meeting_id !== classZoomMeetingId ||
        (identity.profileUpdatedAt && existing.updated_at && new Date(identity.profileUpdatedAt).getTime() > new Date(existing.updated_at).getTime())

      const profileAttempt = await startZoomJobAttemptAudit({
        runDbId: auditContext?.runDbId,
        runId: auditContext?.runId ?? 'missing-run-id',
        actionType: 'registrant_register',
        triggerSource: auditContext?.triggerSource ?? 'unknown',
        triggerKind: auditContext?.triggerKind ?? 'unknown',
        classId: classRow.id,
        classZoomMeetingId,
        profileId: identity.profileId,
        classZoomRegistrantId: existing?.id ?? null,
        requestPayload: {
          profileId: identity.profileId,
          email: identity.email,
          source: identity.source,
          mustReregister,
        },
      })

      if (!mustReregister) {
        skipped += 1
        await finishZoomJobAttemptAudit(profileAttempt, {
          id: profileAttempt?.id ?? '',
          status: 'skipped',
          resultPayload: { reason: 'already_registered', profileId: identity.profileId },
        })
        continue
      }

    try {
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

      const registerRequest = {
        first_name: identity.firstName,
        last_name: identity.lastName,
        email: identity.email,
      }
      const registrant = await zoomApiClient.registerParticipant(meetingId, registerRequest)

      const tokenHash = hashZlrToken(newZlrToken())
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

      await finishZoomJobAttemptAudit(profileAttempt, {
        id: profileAttempt?.id ?? '',
        status: 'succeeded',
        resultPayload: {
          profileId: identity.profileId,
          created: !existing,
          updated: Boolean(existing),
          zoomRegistrantId: registrant?.registrant_id ?? null,
          hasJoinUrl: Boolean(registrant?.join_url),
        },
        externalResponsePayload: {
          registerParticipant: registrant as Record<string, unknown> | null,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown registrant creation error'
      failures.push({
        profileId: identity.profileId,
        email: identity.email,
        error: `${message} | attempted_profile_id=${identity.profileId} | attempted_email=${identity.email}`,
      })
      await finishZoomJobAttemptAudit(profileAttempt, {
        id: profileAttempt?.id ?? '',
        status: 'failed',
        errorMessage: message,
        errorPayload: {
          profileId: identity.profileId,
          email: identity.email,
        },
      })
      continue
    }
  }

    const batchResult = { created, updated, removed, skipped, failures }
    await finishZoomJobAttemptAudit(registrantBatchAttempt, {
      id: registrantBatchAttempt?.id ?? '',
      status: failures.length ? 'failed' : 'succeeded',
      resultPayload: {
        created,
        updated,
        removed,
        skipped,
        failuresCount: failures.length,
      },
      errorPayload: failures.length ? { failures } : {},
      errorMessage: failures.length ? 'One or more registrant attempts failed' : null,
    })

    return batchResult
  } catch (error) {
    await finishZoomJobAttemptAudit(registrantBatchAttempt, {
      id: registrantBatchAttempt?.id ?? '',
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown registrant batch error',
      errorPayload: {
        name: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    throw error
  }
}

export const provisionClassById = async (classId: string, options: ProvisionOptions = {}): Promise<ProvisionClassResult> => {
  const targetProfileId =
    typeof options.targetProfileId === 'string' && options.targetProfileId.trim()
      ? options.targetProfileId.trim()
      : null
  const scope: 'class' | 'profile' = targetProfileId ? 'profile' : 'class'
  const lockOwnerRunId =
    typeof options.lockOwnerRunId === 'string' && options.lockOwnerRunId.trim()
      ? options.lockOwnerRunId.trim()
      : `zoom-lock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const lockOwnerKind =
    typeof options.lockOwnerKind === 'string' && options.lockOwnerKind.trim()
      ? options.lockOwnerKind.trim()
      : scope === 'profile'
        ? 'row_register'
        : 'class_sync'
  const rawLockRetryMs = typeof options.lockRetryMs === 'number' ? options.lockRetryMs : 0
  const lockRetryMs = Number.isFinite(rawLockRetryMs) ? Math.max(0, rawLockRetryMs) : 0
  const lockTtlSeconds = Number.parseInt(process.env.ZOOM_CLASS_LOCK_TTL_SECONDS ?? '120', 10)
  const ttlSeconds = Number.isFinite(lockTtlSeconds) ? Math.max(30, lockTtlSeconds) : 120

  const classProvisionAttempt = await startZoomJobAttemptAudit({
    runDbId: options.auditContext?.runDbId,
    runId: options.auditContext?.runId ?? lockOwnerRunId,
    actionType: 'class_provision',
    triggerSource: options.auditContext?.triggerSource ?? 'unknown',
    triggerKind: options.auditContext?.triggerKind ?? 'unknown',
    classId,
    profileId: targetProfileId,
    requestPayload: {
      classId,
      scope,
      targetProfileId,
      lockOwnerKind,
      lockRetryMs,
      forceMeetingRecreate: Boolean(options.forceMeetingRecreate),
    },
  })

  const lockStartMs = Date.now()
  let lockResult = await tryAcquireZoomClassLock({
    classId,
    ownerRunId: lockOwnerRunId,
    ownerKind: lockOwnerKind,
    ttlSeconds,
    metadata: {
      classId,
      scope,
      targetProfileId,
    },
  })

  while (!lockResult.acquired && Date.now() - lockStartMs < lockRetryMs) {
    const backoffMs = Math.min(2000, 250 + Math.floor(Math.random() * 300))
    await wait(backoffMs)
    lockResult = await tryAcquireZoomClassLock({
      classId,
      ownerRunId: lockOwnerRunId,
      ownerKind: lockOwnerKind,
      ttlSeconds,
      metadata: {
        classId,
        scope,
        targetProfileId,
      },
    })
  }

  const lockWaitMs = Date.now() - lockStartMs

  if (!lockResult.acquired) {
    const result = {
      classId,
      attendanceRowsEnsured: 0,
      meetingCreated: false,
      meetingRecreated: false,
      registrantsCreated: 0,
      registrantsUpdated: 0,
      registrantsRemoved: 0,
      registrantsSkipped: 0,
      registrantFailures: [],
      scope,
      targetProfileId,
      lockOwnerRunId,
      lockBlockedByOwnerRunId: lockResult.blockedByOwnerRunId,
      lockBlockedByOwnerKind: lockResult.blockedByOwnerKind,
      lockBlockedByOwnerInstance: lockResult.blockedByOwnerInstance,
      lockBlockedExpiresAt: lockResult.blockedExpiresAt,
      lockTtlRemainingMs: lockResult.ttlRemainingMs,
      lockWaitMs,
      skipped: true,
      skipReason: 'lock_not_acquired',
    }

    await finishZoomJobAttemptAudit(classProvisionAttempt, {
      id: classProvisionAttempt?.id ?? '',
      status: 'skipped',
      resultPayload: {
        skipReason: result.skipReason,
      },
      errorPayload: {
        lockBlockedByOwnerRunId: lockResult.blockedByOwnerRunId,
        lockBlockedByOwnerKind: lockResult.blockedByOwnerKind,
      },
    })

    return result
  }
  const { data: classRowRaw, error: classError } = await adminClient
    .from('class')
    .select('id, workshop_id, starts_at, ends_at, workshop:workshop_id ( description )')
    .eq('id', classId)
    .single()

  if (classError || !classRowRaw) {
    const result = {
      classId,
      attendanceRowsEnsured: 0,
      meetingCreated: false,
      meetingRecreated: false,
      registrantsCreated: 0,
      registrantsUpdated: 0,
      registrantsRemoved: 0,
      registrantsSkipped: 0,
      registrantFailures: [],
      scope,
      targetProfileId,
      lockOwnerRunId,
      lockBlockedByOwnerRunId: null,
      lockBlockedByOwnerKind: null,
      lockBlockedByOwnerInstance: null,
      lockBlockedExpiresAt: null,
      lockTtlRemainingMs: null,
      lockWaitMs,
      error: classError?.message ?? 'Class not found',
    }

    await finishZoomJobAttemptAudit(classProvisionAttempt, {
      id: classProvisionAttempt?.id ?? '',
      status: 'failed',
      errorMessage: result.error,
      errorPayload: {
        classId,
      },
    })

    return result
  }

  const classRow = classRowRaw as unknown as ClassRow

  try {
    const profiles = await getApprovedProfilesForClass(classRow)
    const profilesInScope = targetProfileId ? profiles.filter(profile => profile.id === targetProfileId) : profiles
    const approvedProfileIds = Array.from(new Set(profilesInScope.map(profile => profile.id).filter(Boolean)))

    if (targetProfileId && !approvedProfileIds.length) {
      const result = {
        classId,
        attendanceRowsEnsured: 0,
        meetingCreated: false,
        meetingRecreated: false,
        registrantsCreated: 0,
        registrantsUpdated: 0,
        registrantsRemoved: 0,
        registrantsSkipped: 0,
        registrantFailures: [],
        scope,
        targetProfileId,
        lockOwnerRunId,
        lockBlockedByOwnerRunId: null,
        lockBlockedByOwnerKind: null,
        lockBlockedByOwnerInstance: null,
        lockBlockedExpiresAt: null,
        lockTtlRemainingMs: null,
        lockWaitMs,
        skipped: true,
        skipReason: 'target_profile_not_approved',
      }

      await finishZoomJobAttemptAudit(classProvisionAttempt, {
        id: classProvisionAttempt?.id ?? '',
        status: 'skipped',
        resultPayload: {
          skipReason: result.skipReason,
          targetProfileId,
        },
      })

      return result
    }

    const identities = await buildIdentities(profilesInScope)
    const attendanceRowsEnsured = await ensureAttendanceRowsForClass(classId, approvedProfileIds)

    const meeting = await ensureMeetingForClass({
      classRow,
      forceMeetingRecreate: Boolean(options.forceMeetingRecreate),
      excludedHostIds: options.excludedHostIds,
      auditContext: options.auditContext,
    })

    const registrants = await ensureRegistrantsForClass({
      classRow,
      classZoomMeetingId: meeting.id,
      meetingId: meeting.zoom_meeting_id,
      identities,
      approvedProfileIds: new Set(approvedProfileIds),
      forceReregister: meeting.recreated,
      targetProfileId,
      auditContext: options.auditContext,
    })

    const result = {
      classId,
      attendanceRowsEnsured,
      meetingCreated: meeting.created,
      meetingRecreated: meeting.recreated,
      registrantsCreated: registrants.created,
      registrantsUpdated: registrants.updated,
      registrantsRemoved: registrants.removed,
      registrantsSkipped: registrants.skipped,
      registrantFailures: registrants.failures,
      scope,
      targetProfileId,
      lockOwnerRunId,
      lockBlockedByOwnerRunId: null,
      lockBlockedByOwnerKind: null,
      lockBlockedByOwnerInstance: null,
      lockBlockedExpiresAt: null,
      lockTtlRemainingMs: null,
      lockWaitMs,
    }

    await finishZoomJobAttemptAudit(classProvisionAttempt, {
      id: classProvisionAttempt?.id ?? '',
      status: 'succeeded',
      resultPayload: {
        attendanceRowsEnsured,
        meetingCreated: result.meetingCreated,
        meetingRecreated: result.meetingRecreated,
        registrantsCreated: result.registrantsCreated,
        registrantsUpdated: result.registrantsUpdated,
        registrantsRemoved: result.registrantsRemoved,
        registrantsSkipped: result.registrantsSkipped,
        registrantFailures: result.registrantFailures.length,
      },
    })

    return result
  } catch (error) {
    const result = {
      classId,
      attendanceRowsEnsured: 0,
      meetingCreated: false,
      meetingRecreated: false,
      registrantsCreated: 0,
      registrantsUpdated: 0,
      registrantsRemoved: 0,
      registrantsSkipped: 0,
      registrantFailures: [],
      scope,
      targetProfileId,
      lockOwnerRunId,
      lockBlockedByOwnerRunId: null,
      lockBlockedByOwnerKind: null,
      lockBlockedByOwnerInstance: null,
      lockBlockedExpiresAt: null,
      lockTtlRemainingMs: null,
      lockWaitMs,
      error: error instanceof Error ? error.message : 'Unknown provisioning error',
    }

    await finishZoomJobAttemptAudit(classProvisionAttempt, {
      id: classProvisionAttempt?.id ?? '',
      status: 'failed',
      errorMessage: result.error,
      errorPayload: {
        name: error instanceof Error ? error.name : 'UnknownError',
      },
    })

    return result
  } finally {
    await releaseZoomClassLock({ classId, ownerRunId: lockOwnerRunId })
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
