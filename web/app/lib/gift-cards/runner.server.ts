import { sendTemplateEmail } from '@/lib/email/send-email.server'
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

const allocationKey = (classId: string, profileId: string) => `${classId}::${profileId}`

const nextReleaseAtIso = (classEndsAt: string | null) => {
  if (!classEndsAt) return null
  const end = new Date(classEndsAt)
  if (!Number.isFinite(end.getTime())) return null

  for (let daysAhead = 0; daysAhead <= 14; daysAhead += 1) {
    const candidate = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + daysAhead, 12, 0, 0, 0))
    if (candidate.getTime() < end.getTime()) continue
    const day = candidate.getUTCDay()
    if (day === 1 || day === 5) {
      return candidate.toISOString()
    }
  }

  return null
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
  const { data: attendanceRows, error: attendanceError } = await adminClient
    .from('class_attendance')
    .select('id, class_id, profile_id, status, gift_card_blocked, class:class_id(ends_at), profile:profile_id(email)')
    .eq('status', 'present')

  if (attendanceError) {
    throw new Error(`Failed to load attendance rows: ${attendanceError.message}`)
  }

  const typedRows = (attendanceRows ?? []) as Array<{
    id: string
    class_id: string
    profile_id: string
    status: string | null
    gift_card_blocked: boolean | null
    class: { ends_at: string | null } | Array<{ ends_at: string | null }> | null
    profile: { email: string | null } | Array<{ email: string | null }> | null
  }>

  const classIds = Array.from(new Set(typedRows.map(row => row.class_id)))
  const profileIds = Array.from(new Set(typedRows.map(row => row.profile_id)))

  let requestedProviderByProfileId = new Map<string, 'PC' | 'Sobeys' | 'meal_kit' | null>()
  if (profileIds.length) {
    try {
      const enrichment = await loadWorkshopEnrollmentEnrichment(profileIds)
      for (const profileId of profileIds) {
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

  for (const row of typedRows) {
    if (row.gift_card_blocked) continue
    if (allocationByPair.has(allocationKey(row.class_id, row.profile_id))) continue

    const requestedProvider = requestedProviderByProfileId.get(row.profile_id) ?? null
    if (requestedProvider === 'meal_kit') continue
    const providerForAllocation = requestedProvider === 'Sobeys' ? 'Sobeys' : 'PC'

    const providerBucket = availableByProvider[providerForAllocation]
    if (!providerBucket.length) continue

    const classRelation = Array.isArray(row.class) ? row.class[0] : row.class
    const releaseAt = nextReleaseAtIso(classRelation?.ends_at ?? null)
    if (!releaseAt) continue

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
          release_at: releaseAt,
        },
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

  return allocated
}

const sendDueReminders = async (appOrigin: string) => {
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: allocations, error: allocationError } = await adminClient
    .from('gift_card_allocation')
    .select('id, class_id, profile_id, gift_card_asset_id, status, blocked, reminder_sent_at, metadata, profile:profile_id(email), asset:gift_card_asset_id(provider, value)')
    .eq('status', 'allocated')
    .is('reminder_sent_at', null)

  if (allocationError) {
    throw new Error(`Failed to load due reminders: ${allocationError.message}`)
  }

  let remindersSent = 0
  let remindersSkipped = 0
  let reminderFailures = 0
  const errors: string[] = []

  const rows = (allocations ?? []) as Array<{
    id: string
    class_id: string
    profile_id: string
    gift_card_asset_id: string
    status: 'allocated' | 'sent' | 'opened'
    blocked: boolean
    reminder_sent_at: string | null
    metadata: { release_at?: string | null } | null
    profile: { email: string | null } | Array<{ email: string | null }> | null
    asset: { provider: 'PC' | 'Sobeys'; value: number } | Array<{ provider: 'PC' | 'Sobeys'; value: number }> | null
  }>

  for (const row of rows) {
    if (row.blocked) {
      remindersSkipped += 1
      continue
    }

    const releaseAt = (row.metadata?.release_at ?? '').trim()
    if (!releaseAt) {
      remindersSkipped += 1
      continue
    }

    const releaseAtMs = new Date(releaseAt).getTime()
    if (!Number.isFinite(releaseAtMs) || releaseAtMs > now.getTime()) {
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
    const glrUrl = `${appOrigin}/glr/${token}`
    const eventKey = `gift-card-reminder:${row.id}`
    const assetRelation = Array.isArray(row.asset) ? row.asset[0] : row.asset

    const emailResult = await sendTemplateEmail({
      toEmail,
      templateKey: 'gift_card_reminder_v1',
      templateData: {
        provider: assetRelation?.provider ?? 'PC',
        amount: Number(assetRelation?.value ?? 0),
        redemptionUrl: glrUrl,
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

  let allocated = 0
  try {
    allocated = await allocateGiftCards()
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'allocate step failed')
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
}
