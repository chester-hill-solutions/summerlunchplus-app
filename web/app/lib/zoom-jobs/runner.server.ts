import { sendTemplateEmail } from '@/lib/email/send-email.server'
import { resolveFamilyContactsByProfileId } from '@/lib/family.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { getClassesInWindow, provisionClassById } from '@/lib/zoom-jobs/provision.server'
import { ZoomApiError, zoomApiClient } from '@/lib/zoom-jobs/zoom-api.client.server'

const toIso = (date: Date) => date.toISOString()

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

const normalizeEmail = (value: string | null) => (value ?? '').trim().toLowerCase()

const ensureOrigin = (origin: string) => origin.replace(/\/+$/, '')

const resolvePublicAppOrigin = (fallbackOrigin: string) => {
  const railwayPublicDomain = (process.env.RAILWAY_PUBLIC_DOMAIN ?? '').trim()
  const railwayPublicOrigin = railwayPublicDomain ? `https://${railwayPublicDomain}` : ''
  const explicitOrigin = [
    process.env.PUBLIC_APP_ORIGIN,
    process.env.APP_BASE_URL,
    railwayPublicOrigin,
    process.env.VITE_PUBLIC_APP_ORIGIN,
    process.env.VITE_APP_ORIGIN,
  ]
    .map(value => (value ?? '').trim())
    .find(Boolean)
    ?? ''
  return ensureOrigin(explicitOrigin || fallbackOrigin)
}

const tryAcquireZoomRunnerLock = async () => {
  const { data, error } = await adminClient.rpc('zoom_try_advisory_lock', {
    p_lock_name: 'zoom:runner',
  })
  if (error) throw new Error(`Failed to acquire Zoom runner lock: ${error.message}`)
  return data === true
}

const releaseZoomRunnerLock = async () => {
  const { data, error } = await adminClient.rpc('zoom_advisory_unlock', {
    p_lock_name: 'zoom:runner',
  })
  if (error) {
    console.error('[zoom-jobs][lock] runner unlock failed', { error: error.message })
    return false
  }
  return data === true
}

const tryAcquireZoomRegistrantReminderLock = async (registrantId: string) => {
  const { data, error } = await adminClient.rpc('zoom_try_advisory_lock', {
    p_lock_name: `zoom:registrant-reminder:${registrantId}`,
  })
  if (error) throw new Error(`Failed to acquire Zoom registrant reminder lock: ${error.message}`)
  return data === true
}

const releaseZoomRegistrantReminderLock = async (registrantId: string) => {
  const { data, error } = await adminClient.rpc('zoom_advisory_unlock', {
    p_lock_name: `zoom:registrant-reminder:${registrantId}`,
  })
  if (error) {
    console.error('[zoom-jobs][lock] registrant reminder unlock failed', { registrantId, error: error.message })
    return false
  }
  return data === true
}

const REPROVISION_HORIZON_MINUTES = 36 * 60
const REMINDER_WINDOW_MINUTES = 2 * 60
const POST_CLASS_FOLLOWUP_DELAY_HOURS = 24
const RUNNING_SYNC_TIMEOUT_MINUTES = 20
const FAILED_SYNC_RETRY_COOLDOWN_MINUTES = 10
const IN_CLAUSE_BATCH_SIZE = 150

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const backfillAttendanceRowsCoverage = async ({ now }: { now: Date }) => {
  const startsAtOrBefore = toIso(addMinutes(now, REPROVISION_HORIZON_MINUTES))
  const { data: classRows, error: classError } = await adminClient
    .from('class')
    .select('id, workshop_id')
    .lte('starts_at', startsAtOrBefore)

  if (classError) {
    return { ok: false, classesScanned: 0, expectedPairs: 0, inserted: 0, error: classError.message }
  }

  const classes = (classRows ?? []) as Array<{ id: string; workshop_id: string | null }>
  if (!classes.length) {
    return { ok: true, classesScanned: 0, expectedPairs: 0, inserted: 0 }
  }

  const classIds = classes.map(row => row.id)
  const workshopIds = Array.from(new Set(classes.map(row => row.workshop_id).filter((id): id is string => Boolean(id))))

  const { data: enrollments, error: enrollmentError } = workshopIds.length
    ? await adminClient
        .from('workshop_enrollment')
        .select('workshop_id, profile_id')
        .in('workshop_id', workshopIds)
        .eq('status', 'approved')
        .not('profile_id', 'is', null)
    : { data: [], error: null }

  if (enrollmentError) {
    return { ok: false, classesScanned: classes.length, expectedPairs: 0, inserted: 0, error: enrollmentError.message }
  }

  const approvedByWorkshop = new Map<string, Set<string>>()
  for (const enrollment of enrollments ?? []) {
    if (!enrollment.workshop_id || !enrollment.profile_id) continue
    const bucket = approvedByWorkshop.get(enrollment.workshop_id) ?? new Set<string>()
    bucket.add(enrollment.profile_id)
    approvedByWorkshop.set(enrollment.workshop_id, bucket)
  }

  const expectedPairs: Array<{ class_id: string; profile_id: string; status: null }> = []
  for (const classRow of classes) {
    if (!classRow.workshop_id) continue
    const approvedProfiles = approvedByWorkshop.get(classRow.workshop_id) ?? new Set<string>()
    for (const profileId of approvedProfiles) {
      expectedPairs.push({ class_id: classRow.id, profile_id: profileId, status: null })
    }
  }

  if (!expectedPairs.length) {
    return { ok: true, classesScanned: classes.length, expectedPairs: 0, inserted: 0 }
  }

  const existingPairs = new Set<string>()
  for (const classIdChunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: attendanceRows, error: attendanceError } = await adminClient
      .from('class_attendance')
      .select('class_id, profile_id')
      .in('class_id', classIdChunk)
    if (attendanceError) {
      return {
        ok: false,
        classesScanned: classes.length,
        expectedPairs: expectedPairs.length,
        inserted: 0,
        error: attendanceError.message,
      }
    }
    for (const row of attendanceRows ?? []) {
      if (!row.class_id || !row.profile_id) continue
      existingPairs.add(`${row.class_id}::${row.profile_id}`)
    }
  }

  const missingPairs = expectedPairs.filter(row => !existingPairs.has(`${row.class_id}::${row.profile_id}`))
  if (!missingPairs.length) {
    return { ok: true, classesScanned: classes.length, expectedPairs: expectedPairs.length, inserted: 0 }
  }

  let inserted = 0
  for (const chunk of chunkArray(missingPairs, IN_CLAUSE_BATCH_SIZE)) {
    const rows = chunk.map(row => ({ class_id: row.class_id, profile_id: row.profile_id }))
    const { error } = await adminClient.from('class_attendance').upsert(rows, { onConflict: 'class_id,profile_id' })
    if (error) {
      return {
        ok: false,
        classesScanned: classes.length,
        expectedPairs: expectedPairs.length,
        inserted,
        error: error.message,
      }
    }
    inserted += chunk.length
  }

  return {
    ok: true,
    classesScanned: classes.length,
    expectedPairs: expectedPairs.length,
    inserted,
  }
}

const provisionWithin36h = async ({ now }: { now: Date }) => {
  const classIds = await getClassesInWindow({
    startsAt: toIso(now),
    endsAt: toIso(addMinutes(now, REPROVISION_HORIZON_MINUTES)),
  })

  const results = [] as Awaited<ReturnType<typeof provisionClassById>>[]
  for (const classId of classIds) {
    results.push(await provisionClassById(classId))
  }

  return {
    scanned: classIds.length,
    reconciled: results.filter(result => !result.error && !result.skipped).length,
    skipped: results.filter(result => result.skipped).length,
    failed: results.filter(result => Boolean(result.error)).length,
    details: results,
  }
}

type UpcomingMeeting = {
  id: string
  class_id: string
  zoom_host_id: string
  zoom_meeting_id: string | null
  class: { starts_at: string; ends_at: string } | Array<{ starts_at: string; ends_at: string }> | null
}

const relationRow = <T extends Record<string, unknown>>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null
  if (value && typeof value === 'object') return value
  return null
}

const hasOverlap = (left: { starts_at: string; ends_at: string }, right: { starts_at: string; ends_at: string }) => {
  const leftStart = new Date(left.starts_at).getTime()
  const leftEnd = new Date(left.ends_at).getTime()
  const rightStart = new Date(right.starts_at).getTime()
  const rightEnd = new Date(right.ends_at).getTime()
  return leftStart < rightEnd && rightStart < leftEnd
}

const findHostConflicts = (meetings: UpcomingMeeting[]) => {
  const conflicts: Array<{ hostId: string; sourceClassId: string; targetClassId: string }> = []
  const byHost = new Map<string, UpcomingMeeting[]>()

  for (const meeting of meetings) {
    const bucket = byHost.get(meeting.zoom_host_id) ?? []
    bucket.push(meeting)
    byHost.set(meeting.zoom_host_id, bucket)
  }

  for (const [hostId, hostMeetings] of byHost.entries()) {
    hostMeetings.sort((a, b) => {
      const aClass = relationRow<{ starts_at: string; ends_at: string }>(a.class)
      const bClass = relationRow<{ starts_at: string; ends_at: string }>(b.class)
      const aStart = aClass?.starts_at ? new Date(aClass.starts_at).getTime() : Number.POSITIVE_INFINITY
      const bStart = bClass?.starts_at ? new Date(bClass.starts_at).getTime() : Number.POSITIVE_INFINITY
      return aStart - bStart
    })

    for (let index = 1; index < hostMeetings.length; index += 1) {
      const prev = hostMeetings[index - 1]
      const curr = hostMeetings[index]
      const prevClass = relationRow<{ starts_at: string; ends_at: string }>(prev.class)
      const currClass = relationRow<{ starts_at: string; ends_at: string }>(curr.class)
      if (!prevClass || !currClass) continue
      if (!hasOverlap(prevClass, currClass)) continue

      conflicts.push({
        hostId,
        sourceClassId: prev.class_id,
        targetClassId: curr.class_id,
      })
    }
  }

  return conflicts
}

const reconcileHostOverlaps = async ({ now, onlyClassIds }: { now: Date; onlyClassIds?: Set<string> }) => {
  const { data: meetings, error } = await adminClient
    .from('class_zoom_meeting')
    .select('id, class_id, zoom_host_id, zoom_meeting_id, class:class_id ( starts_at, ends_at )')
    .eq('status', 'created')

  if (error) {
    return {
      scanned: 0,
      detected: 0,
      fixed: 0,
      failed: 1,
      remaining: 0,
      error: error.message,
    }
  }

  const upcoming = ((meetings ?? []) as UpcomingMeeting[]).filter(meeting => {
    const classRow = relationRow<{ starts_at: string; ends_at: string }>(meeting.class)
    if (!classRow) return false
    return new Date(classRow.ends_at).getTime() >= now.getTime()
  })

  const conflicts = findHostConflicts(upcoming)
  let fixed = 0
  let failed = 0
  const targetClassSet = new Set<string>()

  for (const conflict of conflicts) {
    if (onlyClassIds && !onlyClassIds.has(conflict.targetClassId) && !onlyClassIds.has(conflict.sourceClassId)) {
      continue
    }
    if (targetClassSet.has(conflict.targetClassId)) continue
    targetClassSet.add(conflict.targetClassId)

    const result = await provisionClassById(conflict.targetClassId, {
      forceMeetingRecreate: true,
      excludedHostIds: [conflict.hostId],
    })

    if (result.error) {
      failed += 1
    } else {
      fixed += 1
    }
  }

  const { data: meetingsAfter } = await adminClient
    .from('class_zoom_meeting')
    .select('id, class_id, zoom_host_id, zoom_meeting_id, class:class_id ( starts_at, ends_at )')
    .eq('status', 'created')

  const remainingUpcoming = ((meetingsAfter ?? []) as UpcomingMeeting[]).filter(meeting => {
    const classRow = relationRow<{ starts_at: string; ends_at: string }>(meeting.class)
    if (!classRow) return false
    return new Date(classRow.ends_at).getTime() >= now.getTime()
  })
  const remaining = findHostConflicts(remainingUpcoming).length

  return {
    scanned: upcoming.length,
    detected: conflicts.length,
    fixed,
    failed,
    remaining,
  }
}

const resolveReminderRecipientEmail = async (profileId: string) => {
  const { data: profile } = await adminClient
    .from('profile')
    .select('email')
    .eq('id', profileId)
    .maybeSingle<{ email: string | null }>()

  const profileEmail = normalizeEmail(profile?.email ?? null)
  if (profileEmail) return profileEmail

  try {
    const familyContacts = await resolveFamilyContactsByProfileId(adminClient, profileId)
    const guardianEmail = familyContacts
      .map(contact => normalizeEmail(contact.email))
      .find(email => Boolean(email))
    return guardianEmail ?? ''
  } catch {
    return ''
  }
}

const resolveGuardianRecipientForFollowup = async (profileId: string) => {
  const { data: profile, error: profileError } = await adminClient
    .from('profile')
    .select('id, role, firstname, surname, email')
    .eq('id', profileId)
    .maybeSingle<{ id: string; role: string | null; firstname: string | null; surname: string | null; email: string | null }>()

  if (profileError || !profile) {
    return null
  }

  const guardianNameForEmail = (row: { firstname: string | null; surname: string | null; email: string | null }) => {
    const full = [row.firstname ?? '', row.surname ?? '']
      .map(value => value.trim())
      .filter(Boolean)
      .join(' ')
      .trim()
    if (full) return full
    const email = normalizeEmail(row.email)
    if (email) return email
    return 'Parent/Guardian'
  }

  if (profile.role === 'guardian') {
    const email = normalizeEmail(profile.email)
    if (email) {
      return {
        recipientProfileId: profile.id,
        email,
        guardianName: guardianNameForEmail(profile),
      }
    }
  }

  const { data: guardianEdges, error: guardianEdgeError } = await adminClient
    .from('person_guardian_child')
    .select('guardian_profile_id, primary_child')
    .eq('child_profile_id', profileId)

  if (guardianEdgeError) {
    return null
  }

  const prioritizedGuardianIds = (guardianEdges ?? [])
    .slice()
    .sort((left, right) => Number(right.primary_child) - Number(left.primary_child))
    .map(edge => edge.guardian_profile_id)
    .filter((id): id is string => Boolean(id))

  if (prioritizedGuardianIds.length) {
    const { data: guardians, error: guardianError } = await adminClient
      .from('profile')
      .select('id, firstname, surname, email')
      .in('id', prioritizedGuardianIds)

    if (!guardianError && guardians?.length) {
      const guardianById = new Map(guardians.map(guardian => [guardian.id, guardian]))
      for (const guardianId of prioritizedGuardianIds) {
        const guardian = guardianById.get(guardianId)
        if (!guardian) continue
        const email = normalizeEmail(guardian.email)
        if (!email) continue

        return {
          recipientProfileId: guardian.id,
          email,
          guardianName: guardianNameForEmail(guardian),
        }
      }
    }
  }

  const fallbackEmail = normalizeEmail(profile.email)
  if (!fallbackEmail) return null

  return {
    recipientProfileId: profile.id,
    email: fallbackEmail,
    guardianName: guardianNameForEmail(profile),
  }
}

const sendReminderCoverage = async ({ now, appOrigin, onlyClassId }: { now: Date; appOrigin: string; onlyClassId?: string }) => {
  const publicAppOrigin = resolvePublicAppOrigin(appOrigin)
  const reminderStart = now
  const reminderEnd = addMinutes(now, REMINDER_WINDOW_MINUTES)
  const classIds = onlyClassId
    ? [onlyClassId]
    : await getClassesInWindow({ startsAt: toIso(reminderStart), endsAt: toIso(reminderEnd) })

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const classId of classIds) {
    await provisionClassById(classId)

    const { data: classRow } = await adminClient
      .from('class')
      .select('id, starts_at, workshop:workshop_id ( description, timezone )')
      .eq('id', classId)
      .single()

    if (classRow) {
      const startsAtMs = new Date(classRow.starts_at).getTime()
      const inWindow = startsAtMs >= reminderStart.getTime() && startsAtMs < reminderEnd.getTime()
      if (!inWindow) {
        skipped += 1
        continue
      }
    }

    const { data: registrants, error: registrantError } = await adminClient
      .from('class_zoom_registrant')
      .select('id, profile_id, last_sent_at')
      .eq('class_id', classId)

    if (registrantError || !classRow) {
      failed += 1
      continue
    }

    for (const registrant of registrants ?? []) {
      const reminderLockAcquired = await tryAcquireZoomRegistrantReminderLock(registrant.id)
      if (!reminderLockAcquired) {
        skipped += 1
        continue
      }

      try {
      if (registrant.last_sent_at) {
        skipped += 1
        continue
      }

      const email = await resolveReminderRecipientEmail(registrant.profile_id)
      if (!email) {
        skipped += 1
        continue
      }

      const loginUrl = `${publicAppOrigin}/login?next=${encodeURIComponent('/home')}`

      const workshopRelation = Array.isArray(classRow.workshop) ? classRow.workshop[0] : classRow.workshop
      const workshopName =
        workshopRelation &&
        typeof workshopRelation === 'object' &&
        'description' in workshopRelation &&
        typeof workshopRelation.description === 'string' &&
        workshopRelation.description.trim()
          ? workshopRelation.description.trim()
          : 'your class'

      const templateData: { workshopName: string; loginUrl: string } = {
        workshopName,
        loginUrl,
      }

      const result = await sendTemplateEmail({
        toEmail: email,
        templateKey: 'class_reminder_login_v1',
        templateData,
        eventKey: `class:${classId}:registrant:${registrant.id}:reminder_login_v1`,
        profileId: registrant.profile_id,
      })

      if (result.status === 'sent' || result.status === 'skipped') {
        const { error: tokenUpdateError } = await adminClient
          .from('class_zoom_registrant')
          .update({
            last_sent_at: new Date().toISOString(),
          })
          .eq('id', registrant.id)

        if (tokenUpdateError) {
          failed += 1
        } else if (result.status === 'sent') {
          sent += 1
        } else {
          skipped += 1
        }
      } else {
        failed += 1
      }
      } finally {
        await releaseZoomRegistrantReminderLock(registrant.id)
      }
    }
  }

  return { scannedClasses: classIds.length, sent, failed, skipped }
}

const sendPostClassCameraOrPhotoFollowupCoverage = async ({ now, onlyClassId }: { now: Date; onlyClassId?: string }) => {
  const followupThreshold = new Date(now.getTime() - POST_CLASS_FOLLOWUP_DELAY_HOURS * 60 * 60_000).toISOString()
  const attendanceQuery = adminClient
    .from('class_attendance')
    .select('class_id, profile_id, camera_on, photo_status, class:class_id ( ends_at )')

  if (onlyClassId) {
    attendanceQuery.eq('class_id', onlyClassId)
  }

  const { data: attendanceRows, error } = await attendanceQuery

  if (error) {
    return { scanned: 0, eligible: 0, sent: 0, failed: 1, skipped: 0, error: error.message }
  }

  const candidates = (attendanceRows ?? []).filter(row => {
    const classRow = relationRow<{ ends_at: string }>(row.class)
    if (!classRow?.ends_at) return false
    if (new Date(classRow.ends_at).toISOString() > followupThreshold) return false

    const cameraMissingOrOff = row.camera_on !== true
    const photoStatusMissing = row.photo_status == null
    return cameraMissingOrOff && photoStatusMissing
  })

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const row of candidates) {
    const recipient = await resolveGuardianRecipientForFollowup(row.profile_id)
    if (!recipient?.email) {
      skipped += 1
      continue
    }

    const result = await sendTemplateEmail({
      toEmail: recipient.email,
      templateKey: 'class_camera_or_photo_followup_v1',
      templateData: {
        guardianName: recipient.guardianName,
      },
      eventKey: `class:${row.class_id}:profile:${row.profile_id}:camera_or_photo_followup_v1`,
      profileId: row.profile_id,
      familyProfileId: recipient.recipientProfileId,
    })

    if (result.status === 'sent') {
      sent += 1
    } else if (result.status === 'skipped') {
      skipped += 1
    } else {
      failed += 1
    }
  }

  return {
    scanned: (attendanceRows ?? []).length,
    eligible: candidates.length,
    sent,
    failed,
    skipped,
  }
}

const isRecent = ({ now, value, windowMinutes }: { now: Date; value: string | null; windowMinutes: number }) => {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return false
  return now.getTime() - timestamp < windowMinutes * 60_000
}

const dedupeParticipants = (participants: Array<Record<string, unknown>>) => {
  const seen = new Set<string>()
  const rows: Array<{
    class_zoom_meeting_id: string
    class_id: string
    profile_id: null
    zoom_user_id: string | null
    user_name: string | null
    user_email: string | null
    join_time: string | null
    leave_time: string | null
    duration_seconds: number | null
    camera_on: null
    attentiveness_score: null
    raw: Record<string, unknown>
  }> = []

  for (const participant of participants) {
    const zoomUserId = typeof participant.id === 'string' ? participant.id : null
    const userName = typeof participant.name === 'string' ? participant.name : null
    const userEmail = typeof participant.user_email === 'string' ? participant.user_email.toLowerCase() : null
    const joinTime = typeof participant.join_time === 'string' ? participant.join_time : null
    const leaveTime = typeof participant.leave_time === 'string' ? participant.leave_time : null
    const durationSeconds = typeof participant.duration === 'number' ? participant.duration : null
    const signature = [zoomUserId ?? '', userEmail ?? '', joinTime ?? '', leaveTime ?? '', userName ?? ''].join('|')
    if (seen.has(signature)) continue
    seen.add(signature)

    rows.push({
      class_zoom_meeting_id: '',
      class_id: '',
      profile_id: null,
      zoom_user_id: zoomUserId,
      user_name: userName,
      user_email: userEmail,
      join_time: joinTime,
      leave_time: leaveTime,
      duration_seconds: durationSeconds,
      camera_on: null,
      attentiveness_score: null,
      raw: participant,
    })
  }

  return rows
}

const syncPostClassAttendance = async ({ now, onlyClassId }: { now: Date; onlyClassId?: string }) => {
  const meetingQuery = adminClient
    .from('class_zoom_meeting')
    .select('id, class_id, zoom_meeting_uuid, status, class:class_id ( starts_at, ends_at, workshop_id )')
    .eq('status', 'created')

  if (onlyClassId) {
    meetingQuery.eq('class_id', onlyClassId)
  }

  const { data: meetings, error } = await meetingQuery

  if (error) {
    return { scanned: 0, synced: 0, failed: 1, pendingRetry: 0, skippedCooldown: 0, error: error.message }
  }

  let scanned = 0
  let synced = 0
  let failed = 0
  let pendingRetry = 0
  let skippedCooldown = 0
  let absentMarked = 0

  const approvedByWorkshop = new Map<string, Set<string>>()

  const getApprovedProfileIdsForWorkshop = async (workshopId: string | null) => {
    if (!workshopId) return new Set<string>()
    const cached = approvedByWorkshop.get(workshopId)
    if (cached) return cached

    const { data: enrollments, error: enrollmentError } = await adminClient
      .from('workshop_enrollment')
      .select('profile_id')
      .eq('workshop_id', workshopId)
      .eq('status', 'approved')
      .not('profile_id', 'is', null)

    if (enrollmentError) throw new Error(enrollmentError.message)

    const profileIds = new Set((enrollments ?? []).map(row => row.profile_id).filter((id): id is string => Boolean(id)))
    approvedByWorkshop.set(workshopId, profileIds)
    return profileIds
  }

  const nowIso = now.toISOString()

  for (const meeting of meetings ?? []) {
    const classRelation = relationRow<{ starts_at: string; ends_at: string; workshop_id: string | null }>(meeting.class)
    const classEndsAt = classRelation?.ends_at ? new Date(classRelation.ends_at) : null
    if (!classEndsAt || classEndsAt.getTime() > addMinutes(now, -15).getTime()) continue
    if (!meeting.zoom_meeting_uuid) continue
    scanned += 1

    const { data: latestSync } = await adminClient
      .from('class_zoom_participant_sync')
      .select('status, started_at, completed_at, payload')
      .eq('class_zoom_meeting_id', meeting.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const latestPayload = latestSync?.payload && typeof latestSync.payload === 'object' ? latestSync.payload : {}
    const previousAttemptCount =
      typeof (latestPayload as { attempt_count?: unknown }).attempt_count === 'number'
        ? Math.floor((latestPayload as { attempt_count?: number }).attempt_count ?? 0)
        : 0
    const attemptCount = Math.max(1, previousAttemptCount + 1)

    if (
      latestSync?.status === 'running' &&
      isRecent({ now, value: latestSync.started_at, windowMinutes: RUNNING_SYNC_TIMEOUT_MINUTES })
    ) {
      skippedCooldown += 1
      continue
    }

    if (
      latestSync?.status === 'failed' &&
      isRecent({ now, value: latestSync.completed_at, windowMinutes: FAILED_SYNC_RETRY_COOLDOWN_MINUTES })
    ) {
      skippedCooldown += 1
      continue
    }

    const { data: syncRun, error: syncCreateError } = await adminClient
      .from('class_zoom_participant_sync')
      .insert({
        class_zoom_meeting_id: meeting.id,
        status: 'running',
        started_at: nowIso,
        payload: {
          attempt_count: attemptCount,
          started_at: nowIso,
        },
      })
      .select('id')
      .single()

    if (syncCreateError || !syncRun?.id) {
      failed += 1
      continue
    }

    try {
      const approvedProfileIds = await getApprovedProfileIdsForWorkshop(classRelation?.workshop_id ?? null)

      if (approvedProfileIds.size > 0) {
        const approvedProfileIdsList = Array.from(approvedProfileIds)
        const { data: existingRows, error: existingAttendanceError } = await adminClient
          .from('class_attendance')
          .select('profile_id')
          .eq('class_id', meeting.class_id)
          .in('profile_id', approvedProfileIdsList)

        if (existingAttendanceError) throw new Error(existingAttendanceError.message)

        const existingProfileIds = new Set((existingRows ?? []).map(row => row.profile_id).filter((id): id is string => Boolean(id)))
        const missingProfileIds = approvedProfileIdsList.filter(profileId => !existingProfileIds.has(profileId))

        if (missingProfileIds.length) {
          const attendanceSeedRows = missingProfileIds.map(profileId => ({
            class_id: meeting.class_id,
            profile_id: profileId,
          }))
          const { error: attendanceSeedError } = await adminClient
            .from('class_attendance')
            .upsert(attendanceSeedRows, { onConflict: 'class_id,profile_id' })
          if (attendanceSeedError) throw new Error(attendanceSeedError.message)
        }
      }

      const participantsPayload = await zoomApiClient.getParticipants(meeting.zoom_meeting_uuid)
      const participants = participantsPayload.participants ?? []
      const dedupedRows = dedupeParticipants(participants)

      const rows = dedupedRows.map(row => ({
        ...row,
        class_zoom_meeting_id: meeting.id,
        class_id: meeting.class_id,
      }))

      const { error: deleteError } = await adminClient
        .from('class_zoom_participant')
        .delete()
        .eq('class_zoom_meeting_id', meeting.id)
      if (deleteError) throw new Error(deleteError.message)

      if (rows.length) {
        const { error: insertError } = await adminClient.from('class_zoom_participant').insert(rows)
        if (insertError) throw new Error(insertError.message)
      }

      const participantEmails = Array.from(
        new Set(rows.map(row => normalizeEmail(row.user_email)).filter((email): email is string => Boolean(email)))
      )

      const presentProfileIds = new Set<string>()
      const matchSummary = {
        matchedByStudentEmail: 0,
        matchedByGuardianFallback: 0,
        ambiguousGuardianMatches: 0,
        unmatchedParticipantEmails: 0,
      }

      if (participantEmails.length) {
        const { data: profiles, error: profileError } = await adminClient
          .from('profile')
          .select('id, email, role')
          .in('email', participantEmails)
        if (profileError) throw new Error(profileError.message)

        const profilesByEmail = new Map<string, Array<{ id: string; role: string | null }>>()
        for (const profile of profiles ?? []) {
          const email = normalizeEmail(profile.email)
          if (!email) continue
          const bucket = profilesByEmail.get(email) ?? []
          bucket.push({ id: profile.id, role: profile.role ?? null })
          profilesByEmail.set(email, bucket)
        }

        const guardianProfileIds = Array.from(
          new Set(
            (profiles ?? [])
              .filter(profile => normalizeEmail(profile.email) && profile.role === 'guardian')
              .map(profile => profile.id)
          )
        )

        const childIdsByGuardian = new Map<string, Set<string>>()
        if (guardianProfileIds.length && approvedProfileIds.size > 0) {
          const { data: edges, error: edgeError } = await adminClient
            .from('person_guardian_child')
            .select('guardian_profile_id, child_profile_id')
            .in('guardian_profile_id', guardianProfileIds)
            .in('child_profile_id', Array.from(approvedProfileIds))
          if (edgeError) throw new Error(edgeError.message)

          for (const edge of edges ?? []) {
            const bucket = childIdsByGuardian.get(edge.guardian_profile_id) ?? new Set<string>()
            bucket.add(edge.child_profile_id)
            childIdsByGuardian.set(edge.guardian_profile_id, bucket)
          }
        }

        for (const participantEmail of participantEmails) {
          const matchedProfiles = profilesByEmail.get(participantEmail) ?? []
          const directStudentIds = matchedProfiles
            .map(profile => profile.id)
            .filter(profileId => approvedProfileIds.has(profileId))

          if (directStudentIds.length) {
            for (const profileId of directStudentIds) {
              presentProfileIds.add(profileId)
            }
            matchSummary.matchedByStudentEmail += directStudentIds.length
            continue
          }

          const guardianChildCandidates = new Set<string>()
          for (const profile of matchedProfiles) {
            if (profile.role !== 'guardian') continue
            const childIds = childIdsByGuardian.get(profile.id) ?? new Set<string>()
            for (const childId of childIds) {
              guardianChildCandidates.add(childId)
            }
          }

          if (guardianChildCandidates.size === 1) {
            const [childId] = Array.from(guardianChildCandidates)
            presentProfileIds.add(childId)
            matchSummary.matchedByGuardianFallback += 1
          } else if (guardianChildCandidates.size > 1) {
            matchSummary.ambiguousGuardianMatches += 1
          } else {
            matchSummary.unmatchedParticipantEmails += 1
          }
        }

        if (presentProfileIds.size) {
          for (const profileChunk of chunkArray(Array.from(presentProfileIds), IN_CLAUSE_BATCH_SIZE)) {
            const { error: attendanceUpdateError } = await adminClient
              .from('class_attendance')
              .update({ status: 'present', recorded_by: null })
              .eq('class_id', meeting.class_id)
              .in('profile_id', profileChunk)
              .is('status', null)
            if (attendanceUpdateError) {
              throw new Error(attendanceUpdateError.message)
            }
          }
        }
      }

      if (approvedProfileIds.size > 0) {
        const missingProfileIds = Array.from(approvedProfileIds).filter(profileId => !presentProfileIds.has(profileId))
        if (missingProfileIds.length) {
          const { error: absentNullError, count: absentNullCount } = await adminClient
            .from('class_attendance')
            .update({ status: 'absent', recorded_by: null }, { count: 'exact' })
            .eq('class_id', meeting.class_id)
            .in('profile_id', missingProfileIds)
            .is('status', null)
          if (absentNullError) throw new Error(absentNullError.message)

          absentMarked += absentNullCount ?? 0
        }
      }

      await adminClient
        .from('class_zoom_participant_sync')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          payload: {
            attempt_count: attemptCount,
            participant_count: rows.length,
            deduplicated_from: participants.length,
            matched_by_student_email: matchSummary.matchedByStudentEmail,
            matched_by_guardian_fallback: matchSummary.matchedByGuardianFallback,
            ambiguous_guardian_matches: matchSummary.ambiguousGuardianMatches,
            unmatched_participant_emails: matchSummary.unmatchedParticipantEmails,
          },
        })
        .eq('id', syncRun.id)

      await adminClient
        .from('class_zoom_meeting')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', meeting.id)

      synced += 1
    } catch (err) {
      const isRetryableNotReady = err instanceof ZoomApiError && err.status === 409
      if (isRetryableNotReady) {
        pendingRetry += 1
      } else {
        failed += 1
      }

      const retryAfter = new Date(addMinutes(now, FAILED_SYNC_RETRY_COOLDOWN_MINUTES)).toISOString()
      await adminClient
        .from('class_zoom_participant_sync')
        .update({
          status: isRetryableNotReady ? 'pending' : 'failed',
          completed_at: new Date().toISOString(),
          error_message: err instanceof Error ? err.message : 'Unknown attendance sync error',
          payload: {
            attempt_count: attemptCount,
            retry_after: retryAfter,
            retryable: isRetryableNotReady,
            error_type: err instanceof Error ? err.name : 'UnknownError',
          },
        })
        .eq('id', syncRun.id)
    }
  }

  return { scanned, synced, failed, pendingRetry, skippedCooldown, absentMarked }
}

export const runZoomJobs = async ({ now = new Date(), appOrigin, runId }: { now?: Date; appOrigin: string; runId?: string }) => {
  const lockAcquired = await tryAcquireZoomRunnerLock()
  if (!lockAcquired) {
    return {
      ok: true,
      runId: runId ?? null,
      ranAt: now.toISOString(),
      skipped: true,
      reason: 'zoom runner lock not acquired',
    }
  }

  try {
  console.info('[zoom-jobs] run started', {
    runId: runId ?? null,
    now: now.toISOString(),
  })

  const attendanceRowBackfill = await backfillAttendanceRowsCoverage({ now })
  const within36h = await provisionWithin36h({ now })
  const hostReconciliation = await reconcileHostOverlaps({ now })
  const reminders = await sendReminderCoverage({ now, appOrigin })
  const postClassCameraOrPhotoFollowup = await sendPostClassCameraOrPhotoFollowupCoverage({ now })
  const attendanceSync = await syncPostClassAttendance({ now })

  console.info('[zoom-jobs] run completed', {
    runId: runId ?? null,
    ranAt: now.toISOString(),
    within36hScanned: within36h.scanned,
    hostConflictsDetected: hostReconciliation.detected,
    reminderScanned: reminders.scannedClasses,
    postClassFollowupEligible: postClassCameraOrPhotoFollowup.eligible,
    postClassFollowupSent: postClassCameraOrPhotoFollowup.sent,
    attendanceScanned: attendanceSync.scanned,
    attendanceFailed: attendanceSync.failed,
    attendanceAbsentMarked: attendanceSync.absentMarked,
    attendanceRowBackfillOk: attendanceRowBackfill.ok,
    attendanceRowsBackfilled: attendanceRowBackfill.ok ? attendanceRowBackfill.inserted : 0,
  })

  return {
    ok: true,
    runId: runId ?? null,
    ranAt: now.toISOString(),
    provisionWithin36h: within36h,
    hostOverlapReconciliation: hostReconciliation,
    reminderCoverage: reminders,
    postClassCameraOrPhotoFollowup,
    attendanceRowBackfill,
    attendanceSync,
  }
  } finally {
    await releaseZoomRunnerLock()
  }
}

export const runZoomJobsForClass = async ({
  classId,
  now = new Date(),
  appOrigin,
  runId,
}: {
  classId: string
  now?: Date
  appOrigin: string
  runId?: string
}) => {
  const attendanceRowBackfill = await backfillAttendanceRowsCoverage({ now })
  const provision = await provisionClassById(classId, {
    lockOwnerRunId: runId,
    lockOwnerKind: 'class_sync',
  })
  const hostReconciliation = await reconcileHostOverlaps({ now, onlyClassIds: new Set([classId]) })
  const reminderCoverage = await sendReminderCoverage({ now, appOrigin, onlyClassId: classId })
  const postClassCameraOrPhotoFollowup = await sendPostClassCameraOrPhotoFollowupCoverage({ now, onlyClassId: classId })
  const attendanceSync = await syncPostClassAttendance({ now, onlyClassId: classId })

  return {
    ok: true,
    runId: runId ?? null,
    ranAt: now.toISOString(),
    classId,
    attendanceRowBackfill,
    provision,
    hostOverlapReconciliation: hostReconciliation,
    reminderCoverage,
    postClassCameraOrPhotoFollowup,
    attendanceSync,
  }
}

export const runZoomRegistrantForStudent = async ({
  classId,
  profileId,
  now = new Date(),
  runId,
}: {
  classId: string
  profileId: string
  now?: Date
  runId?: string
}) => {
  const provision = await provisionClassById(classId, {
    targetProfileId: profileId,
    lockOwnerRunId: runId,
    lockOwnerKind: 'row_register',
    lockRetryMs: Number.parseInt(process.env.ZOOM_ROW_REGISTER_LOCK_WAIT_MS ?? '25000', 10),
  })

  return {
    ok: true,
    runId: runId ?? null,
    ranAt: now.toISOString(),
    classId,
    profileId,
    provision,
  }
}
