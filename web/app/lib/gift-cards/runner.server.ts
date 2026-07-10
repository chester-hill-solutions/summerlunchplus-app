import { sendTemplateEmail } from '@/lib/email/send-email.server'
import {
  eligibleAfterIso,
  isEligibilityTimingEnabled,
  nextReleaseAtIso,
  releaseReadyAtIso,
  resolveGiftCardRelease,
  resolveGiftCardReleaseFromTiming,
} from '@/lib/gift-cards/release.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { loadWorkshopEnrollmentEnrichment } from '@/routes/manage/workshop-enrollment-enrichment.server'

import { hashGlrToken, newGlrToken } from './token.server'

type GiftCardJobResult = {
  runId: string
  allocated: number
  availabilityBackfilled: number
  remindersSent: number
  remindersSkipped: number
  reminderFailures: number
  mealKitRemindersSent: number
  mealKitRemindersSkipped: number
  mealKitReminderFailures: number
  errors: string[]
}

const allocationKey = (classId: string, profileId: string) => `${classId}::${profileId}`
const PAGE_SIZE = 500

const TORONTO_TIME_ZONE = 'America/Toronto'

const torontoDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TORONTO_TIME_ZONE,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const parseHourMinuteEnv = (name: string, fallback: number) => {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

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

const tryAcquireGiftCardAllocationLock = async (allocationId: string) => {
  const { data, error } = await adminClient.rpc('zoom_try_advisory_lock', {
    p_lock_name: `gift-card:allocation:${allocationId}`,
  })
  if (error) throw new Error(`Failed to acquire gift-card allocation lock: ${error.message}`)
  return data === true
}

const releaseGiftCardAllocationLock = async (allocationId: string) => {
  const { data, error } = await adminClient.rpc('zoom_advisory_unlock', {
    p_lock_name: `gift-card:allocation:${allocationId}`,
  })
  if (error) {
    console.error('[gift-cards][lock] allocation unlock failed', { allocationId, error: error.message })
    return false
  }
  return data === true
}

const REMINDER_HOUR_TORONTO = parseHourMinuteEnv('GIFT_CARD_REMINDER_HOUR_TORONTO', isProductionRuntime ? 12 : 11)
const REMINDER_MINUTE_TORONTO = parseHourMinuteEnv('GIFT_CARD_REMINDER_MINUTE_TORONTO', isProductionRuntime ? 0 : 15)
const MEAL_KIT_REMINDER_HOUR_TORONTO = parseHourMinuteEnv('MEAL_KIT_REMINDER_HOUR_TORONTO', 9)
const MEAL_KIT_REMINDER_MINUTE_TORONTO = parseHourMinuteEnv('MEAL_KIT_REMINDER_MINUTE_TORONTO', 0)

const torontoPartsForDate = (date: Date) => {
  const parts = torontoDateTimeFormatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return {
    weekday: get('weekday'),
    year: Number.parseInt(get('year'), 10),
    month: Number.parseInt(get('month'), 10),
    day: Number.parseInt(get('day'), 10),
    hour: Number.parseInt(get('hour'), 10),
    minute: Number.parseInt(get('minute'), 10),
  }
}

const torontoTimeUtcForDate = (year: number, month: number, day: number, hour: number, minute: number) => {
  for (const utcHour of [16, 17, 15, 18]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, utcHour, minute, 0, 0))
    const toronto = torontoPartsForDate(candidate)
    if (
      toronto.year === year &&
      toronto.month === month &&
      toronto.day === day &&
      toronto.hour === hour &&
      toronto.minute === minute
    ) {
      return candidate
    }
  }

  return null
}

const currentTorontoReminderSlotIso = (now: Date) => {
  const toronto = torontoPartsForDate(now)
  if (
    (toronto.weekday !== 'Mon' && toronto.weekday !== 'Fri') ||
    toronto.hour !== REMINDER_HOUR_TORONTO ||
    toronto.minute < REMINDER_MINUTE_TORONTO ||
    toronto.minute >= REMINDER_MINUTE_TORONTO + 5
  ) {
    return null
  }

  const slot = torontoTimeUtcForDate(
    toronto.year,
    toronto.month,
    toronto.day,
    REMINDER_HOUR_TORONTO,
    REMINDER_MINUTE_TORONTO
  )
  return slot ? slot.toISOString() : null
}

const reminderSlotIsoForTorontoDate = (year: number, month: number, day: number) => {
  const slot = torontoTimeUtcForDate(year, month, day, REMINDER_HOUR_TORONTO, REMINDER_MINUTE_TORONTO)
  return slot ? slot.toISOString() : null
}

const currentTorontoMealKitReminderSlotIso = (now: Date) => {
  const toronto = torontoPartsForDate(now)
  if (
    toronto.weekday !== 'Tue' ||
    toronto.hour !== MEAL_KIT_REMINDER_HOUR_TORONTO ||
    toronto.minute < MEAL_KIT_REMINDER_MINUTE_TORONTO ||
    toronto.minute >= MEAL_KIT_REMINDER_MINUTE_TORONTO + 5
  ) {
    return null
  }

  const slot = torontoTimeUtcForDate(
    toronto.year,
    toronto.month,
    toronto.day,
    MEAL_KIT_REMINDER_HOUR_TORONTO,
    MEAL_KIT_REMINDER_MINUTE_TORONTO
  )
  return slot ? slot.toISOString() : null
}

const CHUNK_SIZE = 250

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const resolveRecipientEmailsByProfileIds = async (profileIds: string[]) => {
  const uniqueProfileIds = Array.from(new Set(profileIds.filter(Boolean)))
  const emailsByProfileId = new Map<string, string>()
  if (!uniqueProfileIds.length) return emailsByProfileId

  const directEmailByProfileId = new Map<string, string>()
  for (const chunk of chunkArray(uniqueProfileIds, CHUNK_SIZE)) {
    const { data, error } = await adminClient.from('profile').select('id, email').in('id', chunk)
    if (error) {
      throw new Error(`Failed to load profile emails: ${error.message}`)
    }
    for (const row of data ?? []) {
      const email = (row.email ?? '').trim().toLowerCase()
      if (email) {
        directEmailByProfileId.set(row.id, email)
      }
    }
  }

  const guardianIdsByChild = new Map<string, string[]>()
  const guardianIds = new Set<string>()
  for (const chunk of chunkArray(uniqueProfileIds, CHUNK_SIZE)) {
    const { data, error } = await adminClient
      .from('person_guardian_child')
      .select('child_profile_id, guardian_profile_id')
      .in('child_profile_id', chunk)

    if (error) {
      throw new Error(`Failed to load guardian relationships: ${error.message}`)
    }

    for (const row of data ?? []) {
      if (!row.child_profile_id || !row.guardian_profile_id) continue
      const bucket = guardianIdsByChild.get(row.child_profile_id) ?? []
      if (!bucket.includes(row.guardian_profile_id)) {
        bucket.push(row.guardian_profile_id)
      }
      guardianIdsByChild.set(row.child_profile_id, bucket)
      guardianIds.add(row.guardian_profile_id)
    }
  }

  const guardianEmailByProfileId = new Map<string, string>()
  const guardianIdList = Array.from(guardianIds)
  for (const chunk of chunkArray(guardianIdList, CHUNK_SIZE)) {
    const { data, error } = await adminClient.from('profile').select('id, email').in('id', chunk)
    if (error) {
      throw new Error(`Failed to load guardian emails: ${error.message}`)
    }
    for (const row of data ?? []) {
      const email = (row.email ?? '').trim().toLowerCase()
      if (email) {
        guardianEmailByProfileId.set(row.id, email)
      }
    }
  }

  for (const profileId of uniqueProfileIds) {
    const direct = directEmailByProfileId.get(profileId)
    if (direct) {
      emailsByProfileId.set(profileId, direct)
      continue
    }

    const guardianCandidates = guardianIdsByChild.get(profileId) ?? []
    for (const guardianId of guardianCandidates) {
      const guardianEmail = guardianEmailByProfileId.get(guardianId)
      if (guardianEmail) {
        emailsByProfileId.set(profileId, guardianEmail)
        break
      }
    }
  }

  return emailsByProfileId
}

const sendMealKitPickupReminders = async () => {
  const now = new Date()
  const nowIso = now.toISOString()
  const reminderSlotIso = currentTorontoMealKitReminderSlotIso(now)
  if (!reminderSlotIso) {
    return {
      remindersSent: 0,
      remindersSkipped: 0,
      reminderFailures: 0,
      errors: [] as string[],
    }
  }

  const { data: activeSemesters, error: activeSemestersError } = await adminClient
    .from('semester')
    .select('id')
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)

  if (activeSemestersError) {
    throw new Error(`Failed to load active semesters: ${activeSemestersError.message}`)
  }

  const activeSemesterIds = (activeSemesters ?? []).map(row => row.id)
  if (!activeSemesterIds.length) {
    return {
      remindersSent: 0,
      remindersSkipped: 0,
      reminderFailures: 0,
      errors: [] as string[],
    }
  }

  const approvedProfileIds = new Set<string>()
  for (const semesterIdChunk of chunkArray(activeSemesterIds, CHUNK_SIZE)) {
    const { data: enrollments, error: enrollmentError } = await adminClient
      .from('workshop_enrollment')
      .select('profile_id')
      .in('semester_id', semesterIdChunk)
      .eq('status', 'approved')
      .not('profile_id', 'is', null)

    if (enrollmentError) {
      throw new Error(`Failed to load approved enrollments: ${enrollmentError.message}`)
    }

    for (const enrollment of enrollments ?? []) {
      if (enrollment.profile_id) {
        approvedProfileIds.add(enrollment.profile_id)
      }
    }
  }

  const profileIds = Array.from(approvedProfileIds)
  if (!profileIds.length) {
    return {
      remindersSent: 0,
      remindersSkipped: 0,
      reminderFailures: 0,
      errors: [] as string[],
    }
  }

  const enrichment = await loadWorkshopEnrollmentEnrichment(profileIds)
  const mealKitProfileIds = profileIds.filter(profileId => {
    const value = (enrichment[profileId]?.giftcard_display ?? '').trim().toLowerCase()
    return value === 'meal kit'
  })

  if (!mealKitProfileIds.length) {
    return {
      remindersSent: 0,
      remindersSkipped: 0,
      reminderFailures: 0,
      errors: [] as string[],
    }
  }

  const emailsByProfileId = await resolveRecipientEmailsByProfileIds(mealKitProfileIds)
  const uniqueRecipients = new Map<string, string>()
  for (const profileId of mealKitProfileIds) {
    const email = (emailsByProfileId.get(profileId) ?? '').trim().toLowerCase()
    if (email && !uniqueRecipients.has(email)) {
      uniqueRecipients.set(email, profileId)
    }
  }

  let remindersSent = 0
  let remindersSkipped = 0
  let reminderFailures = 0
  const errors: string[] = []

  for (const [toEmail, profileId] of uniqueRecipients.entries()) {
    const eventKey = `meal-kit-pickup-reminder:${reminderSlotIso}:${toEmail}`
    const emailResult = await sendTemplateEmail({
      toEmail,
      templateKey: 'meal_kit_pickup_reminder_v1',
      templateData: {},
      profileId,
      eventKey,
    })

    if (emailResult.status === 'failed') {
      reminderFailures += 1
      errors.push(`meal-kit ${toEmail}: ${emailResult.error ?? 'send failed'}`)
      continue
    }

    if (emailResult.status === 'sent') {
      remindersSent += 1
    } else {
      remindersSkipped += 1
    }
  }

  console.info('[gift-cards][meal-kit-reminders]', {
    remindersSent,
    remindersSkipped,
    reminderFailures,
    recipientsScanned: uniqueRecipients.size,
  })

  return {
    remindersSent,
    remindersSkipped,
    reminderFailures,
    errors,
  }
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

const allocateGiftCards = async () => {
  const nowIso = new Date().toISOString()
  const eligibilityTimingEnabled = isEligibilityTimingEnabled()
  const requestedProviderByProfileId = new Map<string, 'PC' | 'Sobeys' | 'meal_kit' | null>()

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
  let allocated = 0

  let lastAttendanceId = ''
  let pagesRead = 0
  let rowsScanned = 0

  while (true) {
    const attendanceQuery = adminClient
      .from('class_attendance')
      .select('id, class_id, profile_id, camera_on, photo_status, gift_card_blocked, class:class_id(starts_at, ends_at), profile:profile_id(email)')
      .or('camera_on.eq.true,photo_status.eq.accepted,photo_status.eq.uploaded')
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    const { data: attendanceRows, error: attendanceError } = lastAttendanceId
      ? await attendanceQuery.gt('id', lastAttendanceId)
      : await attendanceQuery

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

    pagesRead += 1
    rowsScanned += typedRows.length

    const classIds = Array.from(new Set(typedRows.map(row => row.class_id)))
    const profileIds = Array.from(new Set(typedRows.map(row => row.profile_id)))

    const uncachedProfileIds = profileIds.filter(profileId => !requestedProviderByProfileId.has(profileId))
    if (uncachedProfileIds.length) {
      try {
        const enrichment = await loadWorkshopEnrollmentEnrichment(uncachedProfileIds)
        for (const profileId of uncachedProfileIds) {
          const display = enrichment[profileId]?.giftcard_display
          requestedProviderByProfileId.set(profileId, requestedProviderFromDisplay(display))
        }
      } catch (error) {
        console.warn('[gift-cards] provider preference enrichment failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const { data: allocationRows, error: allocationError } = classIds.length
      ? await adminClient
          .from('gift_card_allocation')
          .select('id, class_id, profile_id')
          .in('class_id', classIds)
          .in('profile_id', profileIds)
      : { data: [], error: null }

    if (allocationError) {
      throw new Error(`Failed to load allocations: ${allocationError.message}`)
    }

    const allocationByPair = new Map<string, string>()
    for (const row of allocationRows ?? []) {
      allocationByPair.set(allocationKey(row.class_id, row.profile_id), row.id)
    }

    for (const row of typedRows) {
      const hasAttendanceEvidence = row.camera_on === true || row.photo_status === 'accepted'
      if (!hasAttendanceEvidence) continue
      if (row.gift_card_blocked) continue
      if (allocationByPair.has(allocationKey(row.class_id, row.profile_id))) continue

      const requestedProvider = requestedProviderByProfileId.get(row.profile_id) ?? null
      if (requestedProvider === 'meal_kit') continue
      const providerForAllocation = requestedProvider === 'Sobeys' ? 'Sobeys' : 'PC'

      const providerBucket = availableByProvider[providerForAllocation]
      if (!providerBucket.length) continue

      const classRelation = Array.isArray(row.class) ? row.class[0] : row.class
      const classAt = classRelation?.starts_at ?? classRelation?.ends_at ?? null
      const releaseAt = nextReleaseAtIso(classRelation?.ends_at ?? null)
      if (!releaseAt) continue

      const qualificationSinceAt = eligibilityTimingEnabled ? nowIso : null
      const releaseReadyAt = eligibilityTimingEnabled
        ? releaseReadyAtIso({ classAtIso: classAt, qualificationSinceAtIso: qualificationSinceAt })
        : null
      if (eligibilityTimingEnabled && !releaseReadyAt) continue

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

      const metadata = eligibilityTimingEnabled
        ? {
            release_at: releaseAt,
            qualification_since_at: qualificationSinceAt,
            eligible_after_at: eligibleAfterIso(qualificationSinceAt),
            release_ready_at: releaseReadyAt,
            availability_state:
              releaseReadyAt && Date.parse(releaseReadyAt) <= Date.parse(nowIso)
                ? 'available'
                : 'unavailable',
          }
        : {
            release_at: releaseAt,
            availability_state: Date.parse(releaseAt) <= Date.parse(nowIso) ? 'available' : 'unavailable',
          }

      const { data: inserted, error: insertError } = await adminClient
        .from('gift_card_allocation')
        .insert({
          class_id: row.class_id,
          profile_id: row.profile_id,
          class_attendance_id: row.id,
          gift_card_asset_id: assetId,
          status: 'allocated',
          metadata,
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

    lastAttendanceId = typedRows[typedRows.length - 1]?.id ?? lastAttendanceId
    if (typedRows.length < PAGE_SIZE) break
  }

  console.info('[gift-cards][allocate]', {
    eligibilityTimingEnabled,
    pagesRead,
    rowsScanned,
    allocated,
  })

  return allocated
}

const sendDueReminders = async (appOrigin: string) => {
  const now = new Date()
  const nowIso = now.toISOString()
  const publicHubOrigin = resolvePublicHubOrigin(appOrigin)
  const hubUrl = `${publicHubOrigin}/home`
  const reminderSlotIso = currentTorontoReminderSlotIso(now)

  let remindersSent = 0
  let remindersSkipped = 0
  let reminderFailures = 0
  const errors: string[] = []
  const releaseSourceCount = {
    availability_state: 0,
    missing_availability_state: 0,
    release_ready_at: 0,
    computed_with_qualification: 0,
    legacy_release: 0,
    unresolved: 0,
  }

  let lastAllocationId = ''
  let pagesRead = 0
  let rowsScanned = 0

  while (true) {
    const allocationQuery = adminClient
      .from('gift_card_allocation')
      .select(
        'id, class_id, profile_id, gift_card_asset_id, status, blocked, reminder_sent_at, metadata, class:class_id(starts_at, ends_at), profile:profile_id(email), asset:gift_card_asset_id(provider, value, status, assigned_profile_id)'
      )
      .eq('status', 'allocated')
      .is('reminder_sent_at', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    const { data: allocations, error: allocationError } = lastAllocationId
      ? await allocationQuery.gt('id', lastAllocationId)
      : await allocationQuery

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
      metadata: {
        release_at?: string | null
        release_ready_at?: string | null
        qualification_since_at?: string | null
        availability_state?: string | null
      } | null
      class: { starts_at: string | null; ends_at: string | null } | Array<{ starts_at: string | null; ends_at: string | null }> | null
      profile: { email: string | null } | Array<{ email: string | null }> | null
      asset:
        | { provider: 'PC' | 'Sobeys'; value: number; status: string; assigned_profile_id: string | null }
        | Array<{ provider: 'PC' | 'Sobeys'; value: number; status: string; assigned_profile_id: string | null }>
        | null
    }>

    if (!rows.length) break
    pagesRead += 1
    rowsScanned += rows.length

    for (const row of rows) {
    const allocationLockAcquired = await tryAcquireGiftCardAllocationLock(row.id)
    if (!allocationLockAcquired) {
      remindersSkipped += 1
      continue
    }

    try {
    if (row.blocked) {
      remindersSkipped += 1
      continue
    }

    const classRelation = Array.isArray(row.class) ? row.class[0] : row.class
    const classAt = classRelation?.starts_at ?? classRelation?.ends_at ?? null
    const timingRelease = resolveGiftCardReleaseFromTiming({
      metadata: row.metadata,
      classAt,
      classEndsAt: classRelation?.ends_at ?? null,
      now: now.getTime(),
    })

    const currentAvailabilityState = (row.metadata?.availability_state ?? '').trim().toLowerCase()
    const expectedAvailabilityState = timingRelease.isReleased ? 'available' : 'unavailable'
    if (currentAvailabilityState !== expectedAvailabilityState) {
      const nextMetadata = {
        ...(row.metadata ?? {}),
        availability_state: expectedAvailabilityState,
      }
      const { error: availabilityStateUpdateError } = await adminClient
        .from('gift_card_allocation')
        .update({ metadata: nextMetadata })
        .eq('id', row.id)

      if (availabilityStateUpdateError) {
        reminderFailures += 1
        errors.push(`allocation ${row.id}: failed to update availability state: ${availabilityStateUpdateError.message}`)
        continue
      }

      row.metadata = nextMetadata
    }

    const release = resolveGiftCardRelease({
      metadata: row.metadata,
      classAt,
      classEndsAt: classRelation?.ends_at ?? null,
      now: now.getTime(),
    })
    releaseSourceCount[release.source] += 1

    if (!release.isReleased) {
      continue
    }

    if (timingRelease.source === 'legacy_release') {
      if (!reminderSlotIso || !timingRelease.effectiveReleaseAt) {
        continue
      }

      const releaseDate = new Date(timingRelease.effectiveReleaseAt)
      if (!Number.isFinite(releaseDate.getTime())) {
        continue
      }

      const releaseToronto = torontoPartsForDate(releaseDate)
      const reminderSlotForReleaseDate = reminderSlotIsoForTorontoDate(
        releaseToronto.year,
        releaseToronto.month,
        releaseToronto.day
      )
      if (!reminderSlotForReleaseDate || reminderSlotForReleaseDate !== reminderSlotIso) {
        continue
      }
    }

    const profileRelation = Array.isArray(row.profile) ? row.profile[0] : row.profile
    const toEmail = await resolveRecipientEmail(row.profile_id, profileRelation?.email ?? null)
    if (!toEmail) {
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

    const statusAfterSend = emailResult.status === 'skipped' ? 'sent' : 'sent'
    const { error: allocationUpdateError } = await adminClient
      .from('gift_card_allocation')
      .update({
        status: statusAfterSend,
        reminder_event_key: eventKey,
        reminder_email_message_id: emailResult.id,
        reminder_sent_at: nowIso,
        glr_token_hash: tokenHash,
      })
      .eq('id', row.id)

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
    } finally {
      await releaseGiftCardAllocationLock(row.id)
    }
  }

    lastAllocationId = rows[rows.length - 1]?.id ?? lastAllocationId
    if (rows.length < PAGE_SIZE) break
  }

  console.info('[gift-cards][reminders]', {
    eligibilityTimingEnabled: isEligibilityTimingEnabled(),
    pagesRead,
    rowsScanned,
    remindersSent,
    remindersSkipped,
    reminderFailures,
    releaseSourceCount,
  })

  return {
    remindersSent,
    remindersSkipped,
    reminderFailures,
    errors,
  }
}

const backfillQualifiedAvailabilityStates = async () => {
  const now = new Date()
  const nowIso = now.toISOString()

  let updated = 0
  let skipped = 0
  let failures = 0
  let lastAllocationId = ''
  let pagesRead = 0
  let rowsScanned = 0

  while (true) {
    const allocationQuery = adminClient
      .from('gift_card_allocation')
      .select('id, metadata, class:class_id(starts_at, ends_at)')
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    const { data: allocations, error: allocationError } = lastAllocationId
      ? await allocationQuery.gt('id', lastAllocationId)
      : await allocationQuery

    if (allocationError) {
      throw new Error(`Failed to load allocations for availability backfill: ${allocationError.message}`)
    }

    const rows = (allocations ?? []) as Array<{
      id: string
      metadata: {
        release_at?: string | null
        release_ready_at?: string | null
        qualification_since_at?: string | null
        availability_state?: string | null
      } | null
      class: { starts_at: string | null; ends_at: string | null } | Array<{ starts_at: string | null; ends_at: string | null }> | null
    }>

    if (!rows.length) break
    pagesRead += 1
    rowsScanned += rows.length

    for (const row of rows) {
      const classRelation = Array.isArray(row.class) ? row.class[0] : row.class
      const classAt = classRelation?.starts_at ?? classRelation?.ends_at ?? null
      const timingRelease = resolveGiftCardReleaseFromTiming({
        metadata: row.metadata,
        classAt,
        classEndsAt: classRelation?.ends_at ?? null,
        now: now.getTime(),
      })

      if (!timingRelease.isReleased) {
        skipped += 1
        continue
      }

      const currentAvailabilityState = (row.metadata?.availability_state ?? '').trim().toLowerCase()
      if (currentAvailabilityState === 'available' || currentAvailabilityState === 'true') {
        skipped += 1
        continue
      }

      const metadata =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? ({ ...row.metadata } as Record<string, unknown>)
          : {}

      metadata.availability_state = 'available'
      metadata.availability_backfilled_at = nowIso

      const { error: updateError } = await adminClient
        .from('gift_card_allocation')
        .update({ metadata })
        .eq('id', row.id)

      if (updateError) {
        failures += 1
        console.error('[gift-cards][availability-backfill] update failed', {
          allocationId: row.id,
          error: updateError.message,
        })
        continue
      }

      updated += 1
    }

    lastAllocationId = rows[rows.length - 1]?.id ?? lastAllocationId
    if (rows.length < PAGE_SIZE) break
  }

  console.info('[gift-cards][availability-backfill]', {
    pagesRead,
    rowsScanned,
    updated,
    skipped,
    failures,
  })

  return {
    updated,
    failures,
  }
}

export const runGiftCardJobs = async ({ appOrigin, runId }: { appOrigin: string; runId: string }): Promise<GiftCardJobResult> => {
  const lockAcquired = await tryAcquireGiftCardRunnerLock()
  if (!lockAcquired) {
    return {
      runId,
      allocated: 0,
      availabilityBackfilled: 0,
      remindersSent: 0,
      remindersSkipped: 0,
      reminderFailures: 0,
      mealKitRemindersSent: 0,
      mealKitRemindersSkipped: 0,
      mealKitReminderFailures: 0,
      errors: ['gift-card runner lock not acquired'],
    }
  }

  try {
  const errors: string[] = []

  let allocated = 0
  try {
    allocated = await allocateGiftCards()
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'allocate step failed')
  }

  let availabilityBackfilled = 0
  try {
    const availabilityBackfillResult = await backfillQualifiedAvailabilityStates()
    availabilityBackfilled = availabilityBackfillResult.updated
    if (availabilityBackfillResult.failures > 0) {
      errors.push(`availability backfill failed for ${availabilityBackfillResult.failures} allocations`)
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'availability backfill step failed')
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

  let mealKitRemindersSent = 0
  let mealKitRemindersSkipped = 0
  let mealKitReminderFailures = 0
  try {
    const mealKitReminderResult = await sendMealKitPickupReminders()
    mealKitRemindersSent = mealKitReminderResult.remindersSent
    mealKitRemindersSkipped = mealKitReminderResult.remindersSkipped
    mealKitReminderFailures = mealKitReminderResult.reminderFailures
    errors.push(...mealKitReminderResult.errors)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'meal-kit reminder step failed')
  }

  return {
    runId,
    allocated,
    availabilityBackfilled,
    remindersSent,
    remindersSkipped,
    reminderFailures,
    mealKitRemindersSent,
    mealKitRemindersSkipped,
    mealKitReminderFailures,
    errors,
  }
  } finally {
    await releaseGiftCardRunnerLock()
  }
}
