import { sendTransactionalEmail } from '@/lib/email/send-email.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { getClassesInWindow, provisionClassById } from '@/lib/zoom-jobs/provision.server'
import { ZoomApiError, zoomApiClient } from '@/lib/zoom-jobs/zoom-api.client.server'
import { hashZlrToken, newZlrToken } from '@/lib/zoom-jobs/zlr-token.server'

const toIso = (date: Date) => date.toISOString()

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

const normalizeEmail = (value: string | null) => (value ?? '').trim().toLowerCase()

const ensureOrigin = (origin: string) => origin.replace(/\/+$/, '')

const RUNNING_SYNC_TIMEOUT_MINUTES = 20

const FAILED_SYNC_RETRY_COOLDOWN_MINUTES = 10

const provisionWindow = async ({ now, leadMinutes }: { now: Date; leadMinutes: number }) => {
  const classIds = await getClassesInWindow({
    startsAt: toIso(now),
    endsAt: toIso(addMinutes(now, leadMinutes)),
  })

  const results = [] as Awaited<ReturnType<typeof provisionClassById>>[]
  for (const classId of classIds) {
    results.push(await provisionClassById(classId))
  }

  return {
    scanned: classIds.length,
    provisioned: results.filter(result => !result.error && !result.skipped).length,
    skipped: results.filter(result => result.skipped).length,
    failed: results.filter(result => Boolean(result.error)).length,
    details: results,
  }
}

const reprovision2h30m = async ({ now }: { now: Date }) => {
  const classIds = await getClassesInWindow({
    startsAt: toIso(addMinutes(now, 140)),
    endsAt: toIso(addMinutes(now, 160)),
  })

  const results = [] as Awaited<ReturnType<typeof provisionClassById>>[]
  for (const classId of classIds) {
    results.push(await provisionClassById(classId))
  }

  return {
    scanned: classIds.length,
    reprovisioned: results.filter(result => !result.error && !result.skipped).length,
    skipped: results.filter(result => result.skipped).length,
    failed: results.filter(result => Boolean(result.error)).length,
    details: results,
  }
}

const buildCoverageCheck = async ({ now }: { now: Date }) => {
  const classIds = await getClassesInWindow({
    startsAt: toIso(now),
    endsAt: toIso(addMinutes(now, 24 * 60)),
  })

  if (!classIds.length) {
    return {
      scanned: 0,
      classesMissingMeeting: 0,
      classesWithRegistrantGaps: 0,
      missingMeetingClassIds: [] as string[],
      registrantGapClassIds: [] as string[],
    }
  }

  const { data: classes } = await adminClient.from('class').select('id, workshop_id').in('id', classIds)
  const workshopIds = Array.from(new Set((classes ?? []).map(row => row.workshop_id).filter((id): id is string => Boolean(id))))

  const { data: meetings } = await adminClient
    .from('class_zoom_meeting')
    .select('class_id, status')
    .in('class_id', classIds)

  const { data: registrants } = await adminClient
    .from('class_zoom_registrant')
    .select('class_id, profile_id')
    .in('class_id', classIds)

  const { data: enrollments } = workshopIds.length
    ? await adminClient
        .from('workshop_enrollment')
        .select('workshop_id, profile_id, status')
        .in('workshop_id', workshopIds)
        .eq('status', 'approved')
        .not('profile_id', 'is', null)
    : { data: [] }

  const classToWorkshop = new Map((classes ?? []).map(row => [row.id, row.workshop_id]))
  const hasMeeting = new Set((meetings ?? []).filter(row => row.status === 'created').map(row => row.class_id))

  const expectedByWorkshop = new Map<string, Set<string>>()
  for (const enrollment of enrollments ?? []) {
    if (!enrollment.workshop_id || !enrollment.profile_id) continue
    if (!expectedByWorkshop.has(enrollment.workshop_id)) {
      expectedByWorkshop.set(enrollment.workshop_id, new Set<string>())
    }
    expectedByWorkshop.get(enrollment.workshop_id)?.add(enrollment.profile_id)
  }

  const actualByClass = new Map<string, Set<string>>()
  for (const registrant of registrants ?? []) {
    if (!registrant.class_id || !registrant.profile_id) continue
    if (!actualByClass.has(registrant.class_id)) {
      actualByClass.set(registrant.class_id, new Set<string>())
    }
    actualByClass.get(registrant.class_id)?.add(registrant.profile_id)
  }

  const missingMeetingClassIds: string[] = []
  const registrantGapClassIds: string[] = []

  for (const classId of classIds) {
    if (!hasMeeting.has(classId)) {
      missingMeetingClassIds.push(classId)
    }

    const workshopId = classToWorkshop.get(classId)
    if (!workshopId) continue
    const expectedCount = expectedByWorkshop.get(workshopId)?.size ?? 0
    const actualCount = actualByClass.get(classId)?.size ?? 0
    if (actualCount < expectedCount) {
      registrantGapClassIds.push(classId)
    }
  }

  return {
    scanned: classIds.length,
    classesMissingMeeting: missingMeetingClassIds.length,
    classesWithRegistrantGaps: registrantGapClassIds.length,
    missingMeetingClassIds,
    registrantGapClassIds,
  }
}

const send2hReminders = async ({ now, appOrigin }: { now: Date; appOrigin: string }) => {
  const reminderStart = addMinutes(now, 110)
  const reminderEnd = addMinutes(now, 130)
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
      .select('id, profile_id')
      .eq('class_id', classId)

    if (registrantError || !classRow) {
      failed += 1
      continue
    }

    const profileIds = Array.from(new Set((registrants ?? []).map(row => row.profile_id).filter((id): id is string => Boolean(id))))
    if (!profileIds.length) {
      skipped += 1
      continue
    }

    const { data: profiles, error: profileError } = await adminClient
      .from('profile')
      .select('id, email')
      .in('id', profileIds)

    if (profileError) {
      failed += 1
      continue
    }

    const emailByProfile = new Map((profiles ?? []).map(profile => [profile.id, normalizeEmail(profile.email)]))

    for (const registrant of registrants ?? []) {
      const email = emailByProfile.get(registrant.profile_id) ?? ''
      if (!email) {
        skipped += 1
        continue
      }

      const token = newZlrToken()
      const tokenHash = hashZlrToken(token)
      const expiresAt = addMinutes(new Date(classRow.starts_at), 240).toISOString()

      const { error: tokenUpdateError } = await adminClient
        .from('class_zoom_registrant')
        .update({ zlr_token_hash: tokenHash, zlr_expires_at: expiresAt, last_sent_at: new Date().toISOString() })
        .eq('id', registrant.id)

      if (tokenUpdateError) {
        failed += 1
        continue
      }

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
        eventKey: `class:${classId}:reminder_2h:v1:${registrant.profile_id}`,
        profileId: registrant.profile_id,
      })

      if (result.status === 'sent') {
        sent += 1
      } else if (result.status === 'skipped') {
        skipped += 1
      } else {
        failed += 1
      }
    }
  }

  return { scannedClasses: classIds.length, sent, failed, skipped }
}

const syncPostClassAttendance = async ({ now }: { now: Date }) => {
  const { data: meetings, error } = await adminClient
    .from('class_zoom_meeting')
    .select('id, class_id, zoom_meeting_uuid, status, class:class_id ( starts_at, ends_at )')
    .eq('status', 'created')

  if (error) {
    return { scanned: 0, synced: 0, failed: 1, error: error.message }
  }

  let scanned = 0
  let synced = 0
  let failed = 0
  let pendingRetry = 0
  let skippedCooldown = 0

  const nowIso = now.toISOString()

  const isRecent = (value: string | null, windowMinutes: number) => {
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

    if (latestSync?.status === 'running' && isRecent(latestSync.started_at, RUNNING_SYNC_TIMEOUT_MINUTES)) {
      skippedCooldown += 1
      continue
    }

    if (latestSync?.status === 'failed' && isRecent(latestSync.completed_at, FAILED_SYNC_RETRY_COOLDOWN_MINUTES)) {
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
        const { data: profiles } = await adminClient
          .from('profile')
          .select('id, email')
          .in('email', participantEmails)

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

  const provision24h = await provisionWindow({ now, leadMinutes: 24 * 60 })
  const reprovision = await reprovision2h30m({ now })
  const coverageCheck = await buildCoverageCheck({ now })
  const reminders = await send2hReminders({ now, appOrigin })
  const attendanceSync = await syncPostClassAttendance({ now })

  console.info('[zoom-jobs] run completed', {
    runId: runId ?? null,
    ranAt: now.toISOString(),
    provisionScanned: provision24h.scanned,
    reprovisionScanned: reprovision.scanned,
    coverageScanned: coverageCheck.scanned,
    coverageMissingMeetings: coverageCheck.classesMissingMeeting,
    coverageRegistrantGaps: coverageCheck.classesWithRegistrantGaps,
    reminderScanned: reminders.scannedClasses,
    attendanceScanned: attendanceSync.scanned,
    attendanceFailed: attendanceSync.failed,
  })

  return {
    ok: true,
    runId: runId ?? null,
    ranAt: now.toISOString(),
    provision24h,
    reprovision2h30m: reprovision,
    coverageCheck,
    reminders2h: reminders,
    attendanceSync,
  }
}
