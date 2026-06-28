import { createHash, randomBytes } from 'node:crypto'

import { sendTransactionalEmail } from '@/lib/email/send-email.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { getClassesInWindow, provisionClassById } from '@/lib/zoom-jobs/provision.server'
import { zoomApiClient } from '@/lib/zoom-jobs/zoom-api.client.server'

const toIso = (date: Date) => date.toISOString()

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

const newToken = () => randomBytes(24).toString('base64url')

const normalizeEmail = (value: string | null) => (value ?? '').trim().toLowerCase()

const ensureOrigin = (origin: string) => origin.replace(/\/+$/, '')

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
    provisioned: results.filter(result => !result.error).length,
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
    reprovisioned: results.filter(result => !result.error).length,
    failed: results.filter(result => Boolean(result.error)).length,
    details: results,
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

      const token = newToken()
      const tokenHash = hashToken(token)
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
        .update({ status: 'completed', completed_at: new Date().toISOString(), payload: { participant_count: rows.length } })
        .eq('id', syncRun.id)

      await adminClient
        .from('class_zoom_meeting')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', meeting.id)

      synced += 1
    } catch (err) {
      failed += 1
      await adminClient
        .from('class_zoom_participant_sync')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: err instanceof Error ? err.message : 'Unknown attendance sync error',
        })
        .eq('id', syncRun.id)
    }
  }

  return { scanned, synced, failed }
}

export const runZoomJobs = async ({ now = new Date(), appOrigin }: { now?: Date; appOrigin: string }) => {
  const provision24h = await provisionWindow({ now, leadMinutes: 24 * 60 })
  const reprovision = await reprovision2h30m({ now })
  const reminders = await send2hReminders({ now, appOrigin })
  const attendanceSync = await syncPostClassAttendance({ now })

  return {
    ok: true,
    ranAt: now.toISOString(),
    provision24h,
    reprovision2h30m: reprovision,
    reminders2h: reminders,
    attendanceSync,
  }
}
