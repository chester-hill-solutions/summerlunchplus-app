import { sendTemplateEmail } from '@/lib/email/send-email.server'
import {
  classWeekFridayNoonTorontoIso,
  eligibleAfterIso,
  isReleaseReadyNow,
  releaseReadyAtIso,
} from '@/lib/gift-cards/release.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { loadWorkshopEnrollmentEnrichment } from '@/routes/manage/workshop-enrollment-enrichment.server'

import { hashGlrToken, newGlrToken } from './token.server'

type GiftCardJobResult = {
  runId: string
  allocated: number
  remindersSent: number
  remindersSkipped: number
  reminderFailures: number
  errors: string[]
}

type GiftCardQualificationMetadata = {
  release_at?: string | null
  qualification_state?: 'qualified' | 'unqualified'
  qualification_since_at?: string | null
  qualification_last_changed_at?: string | null
  class_week_friday_noon_at?: string | null
  eligible_after_at?: string | null
  release_ready_at?: string | null
  backfill_source?: string | null
  backfill_version?: string | null
}

const allocationKey = (classId: string, profileId: string) => `${classId}::${profileId}`

const PAGE_SIZE = 500
const QUALIFICATION_BACKFILL_VERSION = '2026-07-08-v1'

const isProductionRuntime = process.env.NODE_ENV === 'production'
const ensureOrigin = (origin: string) => origin.replace(/\/+$/, '')

const resolvePublicHubOrigin = (fallbackOrigin: string) => {
  const railwayPublicDomain = (process.env.RAILWAY_PUBLIC_DOMAIN ?? '').trim()
  const railwayPublicOrigin = railwayPublicDomain ? `https://${railwayPublicDomain}` : ''
  const explicitOrigin = [
    process.env.SITE_ORIGIN,
    process.env.PUBLIC_APP_ORIGIN,
    process.env.APP_BASE_URL,
    railwayPublicOrigin,
    process.env.VITE_PUBLIC_APP_ORIGIN,
    process.env.VITE_APP_ORIGIN,
  ]
    .map(value => (value ?? '').trim())
    .find(Boolean)
  if (explicitOrigin) return ensureOrigin(explicitOrigin)
  if (isProductionRuntime) return 'https://hub.summerlunchplus.com'
  return ensureOrigin(fallbackOrigin)
}

const normalizeMetadata = (value: unknown): GiftCardQualificationMetadata => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as GiftCardQualificationMetadata
}

const validIsoOrNull = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString()
}

const isQualifiedAttendanceEvidence = ({
  cameraOn,
  photoStatus,
  blocked,
}: {
  cameraOn: boolean | null
  photoStatus: 'uploaded' | 'accepted' | 'rejected' | null
  blocked: boolean
}) => {
  if (blocked) return false
  return cameraOn === true || photoStatus === 'accepted' || photoStatus === 'uploaded'
}

const resolveRecipientEmail = async (profileId: string, fallbackEmail: string | null) => {
  const trimmedFallback = (fallbackEmail ?? '').trim().toLowerCase()
  if (trimmedFallback) return trimmedFallback

  const { data: guardianRows, error: guardianError } = await adminClient
    .from('person_guardian_child')
    .select('guardian_profile_id')
    .eq('child_profile_id', profileId)

  if (guardianError) {
    console.error('[gift-cards] failed to load guardians for recipient', {
      profileId,
      error: guardianError.message,
    })
    return ''
  }

  const guardianIds = Array.from(
    new Set((guardianRows ?? []).map(row => row.guardian_profile_id).filter((id): id is string => Boolean(id)))
  )
  if (!guardianIds.length) return ''

  const { data: guardianProfiles, error: profileError } = await adminClient
    .from('profile')
    .select('email')
    .in('id', guardianIds)

  if (profileError) {
    console.error('[gift-cards] failed to load guardian emails for recipient', {
      profileId,
      error: profileError.message,
    })
    return ''
  }

  for (const profile of guardianProfiles ?? []) {
    const email = (profile.email ?? '').trim().toLowerCase()
    if (email) return email
  }

  return ''
}

const requestedProviderFromDisplay = (value: string | null | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('meal kit')) return 'meal_kit'
  if (normalized.includes('sobeys')) return 'Sobeys'
  if (normalized.includes('pc')) return 'PC'
  return null
}

const upsertQualificationMetadata = ({
  previous,
  qualificationState,
  qualificationSinceAt,
  qualificationLastChangedAt,
  classWeekFridayNoonAt,
  eligibleAfterAt,
  releaseReadyAt,
  backfillSource,
}: {
  previous: GiftCardQualificationMetadata
  qualificationState: 'qualified' | 'unqualified'
  qualificationSinceAt: string | null
  qualificationLastChangedAt: string | null
  classWeekFridayNoonAt: string | null
  eligibleAfterAt: string | null
  releaseReadyAt: string | null
  backfillSource: string | null
}) => {
  return {
    ...previous,
    release_at: releaseReadyAt,
    qualification_state: qualificationState,
    qualification_since_at: qualificationSinceAt,
    qualification_last_changed_at: qualificationLastChangedAt,
    class_week_friday_noon_at: classWeekFridayNoonAt,
    eligible_after_at: eligibleAfterAt,
    release_ready_at: releaseReadyAt,
    backfill_source: backfillSource,
    backfill_version: QUALIFICATION_BACKFILL_VERSION,
  } satisfies GiftCardQualificationMetadata
}

const tryAcquireGiftCardRunnerLock = async () => {
  const { data, error } = await adminClient.rpc('zoom_try_advisory_lock', {
    p_lock_name: 'gift-card:runner',
  })
  if (error) throw new Error(`Failed to acquire gift-card runner lock: ${error.message}`)
  return data === true
}

const releaseGiftCardRunnerLock = async () => {
  const { data, error } = await adminClient.rpc('zoom_advisory_unlock', {
    p_lock_name: 'gift-card:runner',
  })
  if (error) {
    console.error('[gift-cards][lock] unlock failed', { error: error.message })
    return false
  }
  return data === true
}

const allocateGiftCards = async () => {
  const nowIso = new Date().toISOString()
  const { data: assets, error: assetsError } = await adminClient
    .from('gift_card_asset')
    .select('id, provider')
    .eq('status', 'available')
    .order('created_at', { ascending: true })

  if (assetsError) {
    throw new Error(`Failed to load available gift cards: ${assetsError.message}`)
  }

  const availableByProvider = {
    PC: [] as string[],
    Sobeys: [] as string[],
  }
  for (const row of assets ?? []) {
    if (row.provider === 'Sobeys') {
      availableByProvider.Sobeys.push(row.id)
    } else {
      availableByProvider.PC.push(row.id)
    }
  }

  const requestedProviderByProfileId = new Map<string, 'PC' | 'Sobeys' | 'meal_kit' | null>()
  let lastAttendanceId: string | null = null
  let allocated = 0

  while (true) {
    let query = adminClient
      .from('class_attendance')
      .select(
        'id, class_id, profile_id, camera_on, photo_status, gift_card_blocked, class:class_id(starts_at, ends_at), profile:profile_id(email)'
      )
      .or('camera_on.eq.true,photo_status.eq.accepted,photo_status.eq.uploaded')
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (lastAttendanceId) {
      query = query.gt('id', lastAttendanceId)
    }

    const { data: attendanceRows, error: attendanceError } = await query
    if (attendanceError) {
      throw new Error(`Failed to load attendance rows: ${attendanceError.message}`)
    }

    const typedRows = (attendanceRows ?? []) as Array<{
      id: string
      class_id: string
      profile_id: string
      camera_on: boolean | null
      photo_status: 'uploaded' | 'accepted' | 'rejected' | null
      gift_card_blocked: boolean | null
      class: { starts_at: string | null; ends_at: string | null } | Array<{ starts_at: string | null; ends_at: string | null }> | null
      profile: { email: string | null } | Array<{ email: string | null }> | null
    }>

    if (!typedRows.length) break
    lastAttendanceId = typedRows[typedRows.length - 1]?.id ?? lastAttendanceId

    const pageProfileIds = Array.from(new Set(typedRows.map(row => row.profile_id)))
    const missingPreferenceProfileIds = pageProfileIds.filter(profileId => !requestedProviderByProfileId.has(profileId))
    if (missingPreferenceProfileIds.length) {
      try {
        const enrichment = await loadWorkshopEnrollmentEnrichment(missingPreferenceProfileIds)
        for (const profileId of missingPreferenceProfileIds) {
          const display = enrichment[profileId]?.giftcard_display
          requestedProviderByProfileId.set(profileId, requestedProviderFromDisplay(display))
        }
      } catch (error) {
        console.warn('[gift-cards] provider preference enrichment failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      for (const profileId of missingPreferenceProfileIds) {
        if (!requestedProviderByProfileId.has(profileId)) {
          requestedProviderByProfileId.set(profileId, null)
        }
      }
    }

    const classIds = Array.from(new Set(typedRows.map(row => row.class_id)))
    const profileIds = Array.from(new Set(typedRows.map(row => row.profile_id)))
    const { data: allocationRows, error: allocationError } = await adminClient
      .from('gift_card_allocation')
      .select('id, class_id, profile_id')
      .in('class_id', classIds)
      .in('profile_id', profileIds)

    if (allocationError) {
      throw new Error(`Failed to load allocations: ${allocationError.message}`)
    }

    const allocationByPair = new Map<string, string>()
    for (const row of allocationRows ?? []) {
      allocationByPair.set(allocationKey(row.class_id, row.profile_id), row.id)
    }

    for (const row of typedRows) {
      const blockedNow = row.gift_card_blocked === true
      const hasAttendanceEvidence = isQualifiedAttendanceEvidence({
        cameraOn: row.camera_on,
        photoStatus: row.photo_status,
        blocked: blockedNow,
      })
      if (!hasAttendanceEvidence) continue
      if (allocationByPair.has(allocationKey(row.class_id, row.profile_id))) continue

      const requestedProvider = requestedProviderByProfileId.get(row.profile_id) ?? null
      if (requestedProvider === 'meal_kit') continue
      const providerForAllocation = requestedProvider === 'Sobeys' ? 'Sobeys' : 'PC'
      const providerBucket = availableByProvider[providerForAllocation]
      if (!providerBucket.length) continue

      const classRelation = Array.isArray(row.class) ? row.class[0] : row.class
      const classAt = classRelation?.starts_at ?? classRelation?.ends_at ?? null
      const classWeekFridayNoonAt = classWeekFridayNoonTorontoIso(classAt)
      const eligibleAfterAt = eligibleAfterIso(nowIso)
      const releaseReadyAt = releaseReadyAtIso({
        classAtIso: classAt,
        qualificationSinceAtIso: nowIso,
      })
      if (!classWeekFridayNoonAt || !eligibleAfterAt || !releaseReadyAt) continue

      const assetId = providerBucket.shift() as string
      const { data: updatedAsset, error: claimError } = await adminClient
        .from('gift_card_asset')
        .update({
          status: 'allocated',
          assigned_profile_id: row.profile_id,
          allocated_at: nowIso,
        })
        .eq('id', assetId)
        .eq('status', 'available')
        .select('id')
        .maybeSingle()

      if (claimError || !updatedAsset?.id) {
        continue
      }

      const { data: inserted, error: insertError } = await adminClient
        .from('gift_card_allocation')
        .insert({
          class_id: row.class_id,
          profile_id: row.profile_id,
          class_attendance_id: row.id,
          gift_card_asset_id: assetId,
          status: 'allocated',
          metadata: {
            release_at: releaseReadyAt,
            qualification_state: 'qualified',
            qualification_since_at: nowIso,
            qualification_last_changed_at: nowIso,
            class_week_friday_noon_at: classWeekFridayNoonAt,
            eligible_after_at: eligibleAfterAt,
            release_ready_at: releaseReadyAt,
            backfill_source: 'allocation_insert',
            backfill_version: QUALIFICATION_BACKFILL_VERSION,
          } satisfies GiftCardQualificationMetadata,
        })
        .select('id')
        .maybeSingle()

      if (insertError || !inserted?.id) {
        await adminClient
          .from('gift_card_asset')
          .update({
            status: 'available',
            assigned_profile_id: null,
            allocated_at: null,
          })
          .eq('id', assetId)
        continue
      }

      allocationByPair.set(allocationKey(row.class_id, row.profile_id), inserted.id)
      allocated += 1
    }
  }

  return allocated
}

const reconcileAllocationQualificationMetadata = async () => {
  let updated = 0
  let lastAllocationId: string | null = null
  const nowIso = new Date().toISOString()

  while (true) {
    let query = adminClient
      .from('gift_card_allocation')
      .select('id, class_id, profile_id, status, blocked, reminder_sent_at, metadata, class:class_id(starts_at, ends_at)')
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (lastAllocationId) {
      query = query.gt('id', lastAllocationId)
    }

    const { data: allocationRows, error: allocationError } = await query
    if (allocationError) {
      throw new Error(`Failed to load allocations for qualification reconciliation: ${allocationError.message}`)
    }

    const rows = (allocationRows ?? []) as Array<{
      id: string
      class_id: string
      profile_id: string
      status: 'allocated' | 'sent' | 'opened'
      blocked: boolean
      reminder_sent_at: string | null
      metadata: unknown
      class: { starts_at: string | null; ends_at: string | null } | Array<{ starts_at: string | null; ends_at: string | null }> | null
    }>
    if (!rows.length) break
    lastAllocationId = rows[rows.length - 1]?.id ?? lastAllocationId

    const classIds = Array.from(new Set(rows.map(row => row.class_id)))
    const profileIds = Array.from(new Set(rows.map(row => row.profile_id)))

    const { data: attendanceRows, error: attendanceError } = await adminClient
      .from('class_attendance')
      .select('class_id, profile_id, camera_on, photo_status, gift_card_blocked, updated_at, created_at')
      .in('class_id', classIds)
      .in('profile_id', profileIds)

    if (attendanceError) {
      throw new Error(`Failed to load attendance for qualification reconciliation: ${attendanceError.message}`)
    }

    const attendanceByPair = new Map(
      ((attendanceRows ?? []) as Array<{
        class_id: string
        profile_id: string
        camera_on: boolean | null
        photo_status: 'uploaded' | 'accepted' | 'rejected' | null
        gift_card_blocked: boolean | null
        updated_at: string | null
        created_at: string | null
      }>).map(row => [allocationKey(row.class_id, row.profile_id), row])
    )

    for (const row of rows) {
      const metadata = normalizeMetadata(row.metadata)
      const attendance = attendanceByPair.get(allocationKey(row.class_id, row.profile_id))
      const blockedNow = row.blocked || attendance?.gift_card_blocked === true
      const qualifiedNow = isQualifiedAttendanceEvidence({
        cameraOn: attendance?.camera_on ?? null,
        photoStatus: attendance?.photo_status ?? null,
        blocked: blockedNow,
      })

      const previousState = metadata.qualification_state === 'qualified' ? 'qualified' : 'unqualified'
      const previousSince = validIsoOrNull(metadata.qualification_since_at)
      let qualificationSinceAt: string | null = null
      let backfillSource: string | null = null

      if (qualifiedNow) {
        if (previousState === 'qualified' && previousSince) {
          qualificationSinceAt = previousSince
          backfillSource = metadata.backfill_source ?? 'existing'
        } else {
          const candidateSince =
            validIsoOrNull(attendance?.updated_at ?? null) ??
            validIsoOrNull(attendance?.created_at ?? null) ??
            validIsoOrNull(row.reminder_sent_at) ??
            nowIso
          qualificationSinceAt = candidateSince
          if (candidateSince === nowIso) {
            backfillSource = 'now_fallback'
          } else if (candidateSince === validIsoOrNull(attendance?.updated_at ?? null)) {
            backfillSource = 'attendance_updated_at'
          } else if (candidateSince === validIsoOrNull(attendance?.created_at ?? null)) {
            backfillSource = 'attendance_created_at'
          } else {
            backfillSource = 'reminder_sent_at'
          }
        }
      }

      const qualificationState: 'qualified' | 'unqualified' = qualifiedNow ? 'qualified' : 'unqualified'
      const stateChanged = qualificationState !== previousState
      const qualificationLastChangedAt = stateChanged
        ? nowIso
        : validIsoOrNull(metadata.qualification_last_changed_at) ?? nowIso

      const classRelation = Array.isArray(row.class) ? row.class[0] : row.class
      const classAt = classRelation?.starts_at ?? classRelation?.ends_at ?? null
      const classWeekFridayNoonAt = classWeekFridayNoonTorontoIso(classAt)
      const eligibilityAfterAt = eligibleAfterIso(qualificationSinceAt)
      const releaseReadyAt = qualifiedNow
        ? releaseReadyAtIso({
            classAtIso: classAt,
            qualificationSinceAtIso: qualificationSinceAt,
          })
        : null

      const nextMetadata = upsertQualificationMetadata({
        previous: metadata,
        qualificationState,
        qualificationSinceAt,
        qualificationLastChangedAt,
        classWeekFridayNoonAt,
        eligibleAfterAt: eligibilityAfterAt,
        releaseReadyAt,
        backfillSource,
      })

      const changed =
        validIsoOrNull(metadata.release_ready_at) !== validIsoOrNull(nextMetadata.release_ready_at) ||
        metadata.qualification_state !== nextMetadata.qualification_state ||
        validIsoOrNull(metadata.qualification_since_at) !== validIsoOrNull(nextMetadata.qualification_since_at) ||
        validIsoOrNull(metadata.qualification_last_changed_at) !== validIsoOrNull(nextMetadata.qualification_last_changed_at) ||
        validIsoOrNull(metadata.class_week_friday_noon_at) !== validIsoOrNull(nextMetadata.class_week_friday_noon_at) ||
        validIsoOrNull(metadata.eligible_after_at) !== validIsoOrNull(nextMetadata.eligible_after_at) ||
        metadata.backfill_source !== nextMetadata.backfill_source ||
        metadata.backfill_version !== nextMetadata.backfill_version

      if (!changed) continue

      const { error: updateError } = await adminClient
        .from('gift_card_allocation')
        .update({ metadata: nextMetadata })
        .eq('id', row.id)

      if (!updateError) {
        updated += 1
      }
    }
  }

  return updated
}

const sendDueReminders = async (appOrigin: string) => {
  const now = new Date()
  const nowIso = now.toISOString()
  const publicHubOrigin = resolvePublicHubOrigin(appOrigin)
  const hubUrl = `${publicHubOrigin}/home`
  const nowMs = now.getTime()

  let remindersSent = 0
  let remindersSkipped = 0
  let reminderFailures = 0
  const errors: string[] = []
  let lastAllocationId: string | null = null

  while (true) {
    let query = adminClient
      .from('gift_card_allocation')
      .select(
        'id, class_id, profile_id, gift_card_asset_id, status, blocked, reminder_sent_at, metadata, class:class_id(starts_at, ends_at), profile:profile_id(email), asset:gift_card_asset_id(provider, value, status, assigned_profile_id)'
      )
      .eq('status', 'allocated')
      .is('reminder_sent_at', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (lastAllocationId) {
      query = query.gt('id', lastAllocationId)
    }

    const { data: allocations, error: allocationError } = await query
    if (allocationError) {
      throw new Error(`Failed to load due reminders: ${allocationError.message}`)
    }

    const rows = (allocations ?? []) as Array<{
      id: string
      class_id: string
      profile_id: string
      gift_card_asset_id: string
      status: 'allocated' | 'sent' | 'opened'
      blocked: boolean
      reminder_sent_at: string | null
      metadata: unknown
      class: { starts_at: string | null; ends_at: string | null } | Array<{ starts_at: string | null; ends_at: string | null }> | null
      profile: { email: string | null } | Array<{ email: string | null }> | null
      asset:
        | { provider: 'PC' | 'Sobeys'; value: number; status: string; assigned_profile_id: string | null }
        | Array<{ provider: 'PC' | 'Sobeys'; value: number; status: string; assigned_profile_id: string | null }>
        | null
    }>
    if (!rows.length) break
    lastAllocationId = rows[rows.length - 1]?.id ?? lastAllocationId

    for (const row of rows) {
      if (row.blocked) {
        remindersSkipped += 1
        continue
      }

      const assetRelation = Array.isArray(row.asset) ? row.asset[0] : row.asset
      const assetAllocatedToProfile =
        assetRelation?.status === 'allocated' &&
        typeof assetRelation.assigned_profile_id === 'string' &&
        assetRelation.assigned_profile_id === row.profile_id
      if (!assetAllocatedToProfile) {
        remindersSkipped += 1
        continue
      }

      const metadata = normalizeMetadata(row.metadata)
      const classRelation = Array.isArray(row.class) ? row.class[0] : row.class
      const classAt = classRelation?.starts_at ?? classRelation?.ends_at ?? null
      const qualificationState = metadata.qualification_state ?? 'unqualified'
      if (qualificationState !== 'qualified') {
        remindersSkipped += 1
        continue
      }

      const releaseReadyAt =
        validIsoOrNull(metadata.release_ready_at) ??
        releaseReadyAtIso({
          classAtIso: classAt,
          qualificationSinceAtIso: validIsoOrNull(metadata.qualification_since_at),
        })

      if (!isReleaseReadyNow({ releaseReadyAt, now: nowMs })) {
        remindersSkipped += 1
        continue
      }

      const profileRelation = Array.isArray(row.profile) ? row.profile[0] : row.profile
      const toEmail = await resolveRecipientEmail(row.profile_id, profileRelation?.email ?? null)
      if (!toEmail) {
        remindersSkipped += 1
        continue
      }

      const token = newGlrToken()
      const tokenHash = hashGlrToken(token)
      const eventKey = `gift-card-reminder:${row.id}`

      const emailResult = await sendTemplateEmail({
        toEmail,
        templateKey: 'gift_card_reminder_v1',
        templateData: {
          provider: assetRelation?.provider ?? 'PC',
          amount: Number(assetRelation?.value ?? 0),
          hubUrl,
        },
        profileId: row.profile_id,
        eventKey,
      })

      if (emailResult.status === 'failed') {
        reminderFailures += 1
        errors.push(`allocation ${row.id}: ${emailResult.error ?? 'send failed'}`)
        continue
      }

      const { error: allocationUpdateError } = await adminClient
        .from('gift_card_allocation')
        .update({
          status: 'sent',
          reminder_event_key: eventKey,
          reminder_email_message_id: emailResult.id,
          reminder_sent_at: nowIso,
          glr_token_hash: tokenHash,
        })
        .eq('id', row.id)
        .is('reminder_sent_at', null)
        .eq('status', 'allocated')

      if (allocationUpdateError) {
        reminderFailures += 1
        errors.push(`allocation ${row.id}: ${allocationUpdateError.message}`)
        continue
      }

      const { error: assetError } = await adminClient
        .from('gift_card_asset')
        .update({
          status: 'sent',
          reminder_sent_at: nowIso,
          sent_at: nowIso,
        })
        .eq('id', row.gift_card_asset_id)

      if (assetError) {
        reminderFailures += 1
        errors.push(`asset ${row.gift_card_asset_id}: ${assetError.message}`)
        continue
      }

      if (emailResult.status === 'sent') {
        remindersSent += 1
      } else {
        remindersSkipped += 1
      }
    }
  }

  return {
    remindersSent,
    remindersSkipped,
    reminderFailures,
    errors,
  }
}

export const runGiftCardJobs = async ({ appOrigin, runId }: { appOrigin: string; runId: string }): Promise<GiftCardJobResult> => {
  const errors: string[] = []
  const lockAcquired = await tryAcquireGiftCardRunnerLock()
  if (!lockAcquired) {
    return {
      runId,
      allocated: 0,
      remindersSent: 0,
      remindersSkipped: 0,
      reminderFailures: 0,
      errors: ['gift-card runner lock not acquired'],
    }
  }

  try {
    let allocated = 0
    try {
      allocated = await allocateGiftCards()
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'allocate step failed')
    }

    try {
      await reconcileAllocationQualificationMetadata()
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'qualification reconciliation step failed')
    }

    let remindersSent = 0
    let remindersSkipped = 0
    let reminderFailures = 0
    try {
      const reminderResult = await sendDueReminders(appOrigin)
      remindersSent = reminderResult.remindersSent
      remindersSkipped = reminderResult.remindersSkipped
      reminderFailures = reminderResult.reminderFailures
      errors.push(...reminderResult.errors)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'reminder step failed')
    }

    return {
      runId,
      allocated,
      remindersSent,
      remindersSkipped,
      reminderFailures,
      errors,
    }
  } finally {
    await releaseGiftCardRunnerLock()
  }
}
