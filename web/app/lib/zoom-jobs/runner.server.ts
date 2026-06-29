import { createHash, randomBytes } from 'node:crypto'

import { sendTransactionalEmail } from '@/lib/email/send-email.server'
import { resolveFamilyContactsByProfileId } from '@/lib/family.server'
import { adminClient } from '@/lib/supabase/adminClient'
import {
  getClassesInWindow,
  getClassesStartingAtOrAfter,
  provisionClassById,
} from '@/lib/zoom-jobs/provision.server'
import { ZoomApiError, zoomApiClient } from '@/lib/zoom-jobs/zoom-api.client.server'

const toIso = (date: Date) => date.toISOString()

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

const newToken = () => randomBytes(24).toString('base64url')

const normalizeEmail = (value: string | null) => (value ?? '').trim().toLowerCase()

const ensureOrigin = (origin: string) => origin.replace(/\/+$/, '')

const REPROVISION_HORIZON_MINUTES = 36 * 60
const REMINDER_WINDOW_MINUTES = 2 * 60

const reprovision36hAndOnward = async ({ now }: { now: Date }) => {
  const start = addMinutes(now, REPROVISION_HORIZON_MINUTES)
  const classIds = await getClassesStartingAtOrAfter({ startsAt: toIso(start) })

  const results = [] as Awaited<ReturnType<typeof provisionClassById>>[]
  for (const classId of classIds) {
    results.push(await provisionClassById(classId))
  }

  return {
    scanned: classIds.length,
    reconciled: results.filter(result => !result.error).length,
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
    reconciled: results.filter(result => !result.error).length,
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
  const reminderStart = now
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

      const token = newToken()
      const tokenHash = hashToken(token)
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

const syncPostClassAttendance = async ({ now }: { now: Date }) => {
  const { data: meetings, error } = await adminClient
    .from('class_zoom_meeting')
    .select('id, class_id, zoom_meeting_uuid, status, class:class_id ( starts_at, ends_at )')
    .eq('status', 'created')

  if (error) {
    return { scanned: 0, synced: 0, failed: 1, pendingRetry: 0, error: error.message }
  }

  let scanned = 0
  let synced = 0
  let failed = 0
  let pendingRetry = 0

  for (const meeting of meetings ?? []) {
    const classRelation = Array.isArray(meeting.class) ? meeting.class[0] : null
    const classEndsAt = classRelation?.ends_at ? new Date(classRelation.ends_at) : null
    if (!classEndsAt || classEndsAt.getTime() > addMinutes(now, -15).getTime()) continue
    if (!meeting.zoom_meeting_uuid) continue
    scanned += 1

    const { data: syncRun, error: syncCreateError } = await adminClient
      .from('class_zoom_participant_sync')
      .insert({ class_zoom_meeting_id: meeting.id, status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .single()

    if (syncCreateError || !syncRun?.id) {
      failed += 1
      continue
    }

    try {
      const participantsPayload = await zoomApiClient.getParticipants(meeting.zoom_meeting_uuid)
      const participants = participantsPayload.participants ?? []

      await adminClient.from('class_zoom_participant').delete().eq('class_zoom_meeting_id', meeting.id)

      const rows = participants.map(participant => ({
        class_zoom_meeting_id: meeting.id,
        class_id: meeting.class_id,
        profile_id: null,
        zoom_user_id: typeof participant.id === 'string' ? participant.id : null,
        user_name: typeof participant.name === 'string' ? participant.name : null,
        user_email: typeof participant.user_email === 'string' ? participant.user_email.toLowerCase() : null,
        join_time: typeof participant.join_time === 'string' ? participant.join_time : null,
        leave_time: typeof participant.leave_time === 'string' ? participant.leave_time : null,
        duration_seconds: typeof participant.duration === 'number' ? participant.duration : null,
        camera_on: null,
        attentiveness_score: null,
        raw: participant,
      }))

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
        .update({ status: 'completed', completed_at: new Date().toISOString(), payload: { participant_count: rows.length } })
        .eq('id', syncRun.id)

      await adminClient
        .from('class_zoom_meeting')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', meeting.id)

      synced += 1
    } catch (err) {
      const retryable = err instanceof ZoomApiError && err.status === 409
      if (retryable) {
        pendingRetry += 1
      } else {
        failed += 1
      }

      await adminClient
        .from('class_zoom_participant_sync')
        .update({
          status: retryable ? 'pending' : 'failed',
          completed_at: new Date().toISOString(),
          error_message: err instanceof Error ? err.message : 'Unknown attendance sync error',
        })
        .eq('id', syncRun.id)
    }
  }

  return { scanned, synced, failed, pendingRetry }
}

export const runZoomJobs = async ({ now = new Date(), appOrigin }: { now?: Date; appOrigin: string }) => {
  const reprovision = await reprovision36hAndOnward({ now })
  const nearTerm = await nearTermGapFill({ now })
  const hostReconciliation = await reconcileHostOverlaps({ now })
  const reminders = await sendReminderCoverage({ now, appOrigin })
  const attendanceSync = await syncPostClassAttendance({ now })

  return {
    ok: true,
    ranAt: now.toISOString(),
    reprovision36hAndOnward: reprovision,
    nearTermGapFill: nearTerm,
    hostOverlapReconciliation: hostReconciliation,
    reminderCoverage: reminders,
    attendanceSync,
  }
}
