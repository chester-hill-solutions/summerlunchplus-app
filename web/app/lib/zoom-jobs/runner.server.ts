import { sendTransactionalEmail } from '@/lib/email/send-email.server'
import { resolveFamilyContactsByProfileId } from '@/lib/family.server'
import { adminClient } from '@/lib/supabase/adminClient'
import {
  getClassesInWindow,
  getClassesStartingAtOrAfter,
  provisionClassById,
} from '@/lib/zoom-jobs/provision.server'
import { ZoomApiError, zoomApiClient } from '@/lib/zoom-jobs/zoom-api.client.server'
import { hashZlrToken, newZlrToken } from '@/lib/zoom-jobs/zlr-token.server'

const toIso = (date: Date) => date.toISOString()

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

const normalizeEmail = (value: string | null) => (value ?? '').trim().toLowerCase()

const ensureOrigin = (origin: string) => origin.replace(/\/+$/, '')

const REPROVISION_HORIZON_MINUTES = 36 * 60
const REMINDER_WINDOW_MINUTES = 2 * 60
const RUNNING_SYNC_TIMEOUT_MINUTES = 20
const FAILED_SYNC_RETRY_COOLDOWN_MINUTES = 10

const reprovision36hAndOnward = async ({ now }: { now: Date }) => {
  const start = addMinutes(now, REPROVISION_HORIZON_MINUTES)
  const classIds = await getClassesStartingAtOrAfter({ startsAt: toIso(start) })

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

const nearTermGapFill = async ({ now }: { now: Date }) => {
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
  class: { starts_at: string; ends_at: string }[] | null
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
      const aClass = Array.isArray(a.class) ? a.class[0] : null
      const bClass = Array.isArray(b.class) ? b.class[0] : null
      const aStart = aClass?.starts_at ? new Date(aClass.starts_at).getTime() : Number.POSITIVE_INFINITY
      const bStart = bClass?.starts_at ? new Date(bClass.starts_at).getTime() : Number.POSITIVE_INFINITY
      return aStart - bStart
    })

    for (let index = 1; index < hostMeetings.length; index += 1) {
      const prev = hostMeetings[index - 1]
      const curr = hostMeetings[index]
      const prevClass = Array.isArray(prev.class) ? prev.class[0] : null
      const currClass = Array.isArray(curr.class) ? curr.class[0] : null
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

const reconcileHostOverlaps = async ({ now }: { now: Date }) => {
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
    const classRow = Array.isArray(meeting.class) ? meeting.class[0] : null
    if (!classRow) return false
    return new Date(classRow.ends_at).getTime() >= now.getTime()
  })

  const conflicts = findHostConflicts(upcoming)
  let fixed = 0
  let failed = 0
  const targetClassSet = new Set<string>()

  for (const conflict of conflicts) {
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

  const remaining = findHostConflicts((meetingsAfter ?? []) as UpcomingMeeting[]).length

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

const sendReminderCoverage = async ({ now, appOrigin }: { now: Date; appOrigin: string }) => {
  const reminderStart = addMinutes(now, -REMINDER_WINDOW_MINUTES)
  const reminderEnd = addMinutes(now, REMINDER_WINDOW_MINUTES)
  const classIds = await getClassesInWindow({ startsAt: toIso(reminderStart), endsAt: toIso(reminderEnd) })

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const classId of classIds) {
    await provisionClassById(classId)

    const { data: classRow } = await adminClient
      .from('class')
      .select('id, starts_at, workshop:workshop_id ( description )')
      .eq('id', classId)
      .single()

    const { data: registrants, error: registrantError } = await adminClient
      .from('class_zoom_registrant')
      .select('id, profile_id, last_sent_at')
      .eq('class_id', classId)

    if (registrantError || !classRow) {
      failed += 1
      continue
    }

    for (const registrant of registrants ?? []) {
      if (registrant.last_sent_at) {
        skipped += 1
        continue
      }

      const email = await resolveReminderRecipientEmail(registrant.profile_id)
      if (!email) {
        skipped += 1
        continue
      }

      const token = newZlrToken()
      const tokenHash = hashZlrToken(token)
      const expiresAt = addMinutes(new Date(classRow.starts_at), 240).toISOString()
      const joinLink = `${ensureOrigin(appOrigin)}/zlr/${token}`

      const workshopName =
        typeof classRow.workshop === 'object' && classRow.workshop && 'description' in classRow.workshop
          ? (classRow.workshop.description ?? 'your class')
          : 'your class'

      const startsAtText = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(classRow.starts_at))

      const result = await sendTransactionalEmail({
        toEmail: email,
        subject: `Reminder: ${workshopName} starts soon`,
        text: `Your class starts at ${startsAtText}. Join here: ${joinLink}`,
        html: `<p>Your class starts at <strong>${startsAtText}</strong>.</p><p><a href="${joinLink}">Join class</a></p>`,
        templateKey: 'class_reminder_zoom_link_v1',
        templateData: {
          classId,
          startsAt: classRow.starts_at,
          joinLink,
        },
        eventKey: `class:${classId}:registrant:${registrant.id}:reminder_v2:${tokenHash.slice(0, 12)}`,
        profileId: registrant.profile_id,
      })

      if (result.status === 'sent' || result.status === 'skipped') {
        const { error: tokenUpdateError } = await adminClient
          .from('class_zoom_registrant')
          .update({
            zlr_token_hash: tokenHash,
            zlr_expires_at: expiresAt,
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
    }
  }

  return { scannedClasses: classIds.length, sent, failed, skipped }
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

const syncPostClassAttendance = async ({ now }: { now: Date }) => {
  const { data: meetings, error } = await adminClient
    .from('class_zoom_meeting')
    .select('id, class_id, zoom_meeting_uuid, status, class:class_id ( starts_at, ends_at )')
    .eq('status', 'created')

  if (error) {
    return { scanned: 0, synced: 0, failed: 1, pendingRetry: 0, skippedCooldown: 0, error: error.message }
  }

  let scanned = 0
  let synced = 0
  let failed = 0
  let pendingRetry = 0
  let skippedCooldown = 0

  const nowIso = now.toISOString()

  for (const meeting of meetings ?? []) {
    const classRelation = Array.isArray(meeting.class) ? meeting.class[0] : null
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

      if (participantEmails.length) {
        const { data: profiles } = await adminClient.from('profile').select('id, email').in('email', participantEmails)

        for (const profile of profiles ?? []) {
          const { error: attendanceUpdateError } = await adminClient
            .from('class_attendance')
            .update({ status: 'present', recorded_by: null })
            .eq('class_id', meeting.class_id)
            .eq('profile_id', profile.id)
          if (attendanceUpdateError) {
            throw new Error(attendanceUpdateError.message)
          }
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

  return { scanned, synced, failed, pendingRetry, skippedCooldown }
}

export const runZoomJobs = async ({ now = new Date(), appOrigin, runId }: { now?: Date; appOrigin: string; runId?: string }) => {
  console.info('[zoom-jobs] run started', {
    runId: runId ?? null,
    now: now.toISOString(),
  })

  const reprovision = await reprovision36hAndOnward({ now })
  const nearTerm = await nearTermGapFill({ now })
  const hostReconciliation = await reconcileHostOverlaps({ now })
  const reminders = await sendReminderCoverage({ now, appOrigin })
  const attendanceSync = await syncPostClassAttendance({ now })

  console.info('[zoom-jobs] run completed', {
    runId: runId ?? null,
    ranAt: now.toISOString(),
    reprovisionScanned: reprovision.scanned,
    nearTermScanned: nearTerm.scanned,
    hostConflictsDetected: hostReconciliation.detected,
    reminderScanned: reminders.scannedClasses,
    attendanceScanned: attendanceSync.scanned,
    attendanceFailed: attendanceSync.failed,
  })

  return {
    ok: true,
    runId: runId ?? null,
    ranAt: now.toISOString(),
    reprovision36hAndOnward: reprovision,
    nearTermGapFill: nearTerm,
    hostOverlapReconciliation: hostReconciliation,
    reminderCoverage: reminders,
    attendanceSync,
  }
}
