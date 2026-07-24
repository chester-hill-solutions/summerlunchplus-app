import { adminClient } from '@/lib/supabase/adminClient'

export type GiftCardProvider = 'PC' | 'Sobeys'

type GiftCardAssetStatus = 'available' | 'allocated' | 'sent' | 'opened' | 'used' | 'invalid'

const IN_CLAUSE_BATCH_SIZE = 10
const GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE = 'gift_card_store_preference'
const PROVIDERS: GiftCardProvider[] = ['PC', 'Sobeys']
const ASSET_STATUS_ORDER: GiftCardAssetStatus[] = ['available', 'allocated', 'sent', 'opened', 'used', 'invalid']

const parseNonNegativeIntEnv = (name: string, fallback: number) => {
  const raw = (process.env[name] ?? '').trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

export const parseGiftCardProviderFromDisplay = (value: string | null | undefined): GiftCardProvider | null => {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return 'PC'
  if (normalized.includes('meal kit')) return null
  if (normalized.includes('sobeys')) return 'Sobeys'
  if (normalized.includes('pc') || normalized.includes('president')) return 'PC'
  return 'PC'
}

export const resolveGiftCardLowThresholds = () => ({
  PC: parseNonNegativeIntEnv('GIFT_CARD_LOW_THRESHOLD_PC', 0),
  Sobeys: parseNonNegativeIntEnv('GIFT_CARD_LOW_THRESHOLD_SOBEYS', 0),
})

export const resolveGiftCardDemandHorizonDays = () => parseNonNegativeIntEnv('GIFT_CARD_DEMAND_HORIZON_DAYS', 14)

export type GiftCardProviderInventorySummary = {
  provider: GiftCardProvider
  statusCounts: Record<GiftCardAssetStatus, number>
  total: number
  available: number
  threshold: number
  isLow: boolean
  nearTermDemand: number
  upcomingDemand: number
  projectedDemand: number
  projectedShortfall: number
}

export type GiftCardInventorySnapshot = {
  generatedAt: string
  horizonDays: number
  providers: Record<GiftCardProvider, GiftCardProviderInventorySummary>
  statusTotals: Record<GiftCardAssetStatus, number>
  totals: {
    totalAssets: number
    totalAvailable: number
    totalNearTermDemand: number
    totalUpcomingDemand: number
    totalProjectedDemand: number
  }
}

const emptyStatusCounts = (): Record<GiftCardAssetStatus, number> => ({
  available: 0,
  allocated: 0,
  sent: 0,
  opened: 0,
  used: 0,
  invalid: 0,
})

export const loadGiftCardInventorySnapshot = async (): Promise<GiftCardInventorySnapshot> => {
  const generatedAt = new Date().toISOString()
  const thresholds = resolveGiftCardLowThresholds()
  const horizonDays = resolveGiftCardDemandHorizonDays()

  const statusByProvider: Record<GiftCardProvider, Record<GiftCardAssetStatus, number>> = {
    PC: emptyStatusCounts(),
    Sobeys: emptyStatusCounts(),
  }

  const statusCountTasks: Array<Promise<void>> = []
  for (const provider of PROVIDERS) {
    for (const status of ASSET_STATUS_ORDER) {
      statusCountTasks.push(
        countGiftCardAssets({ provider, status }).then(count => {
          statusByProvider[provider][status] = count
        })
      )
    }
  }
  await Promise.all(statusCountTasks)

  const now = new Date()
  const horizonEnd = new Date(now)
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizonDays)
  const nowIso = now.toISOString()
  const horizonEndIso = horizonEnd.toISOString()

  const { data: classRows, error: classError } = await adminClient
    .from('class')
    .select('workshop_id')
    .gte('starts_at', nowIso)
    .lte('starts_at', horizonEndIso)

  if (classError) {
    throw new Error(`Failed to load class demand windows: ${classError.message}`)
  }

  const upcomingWorkshopIds = new Set<string>()

  for (const row of classRows ?? []) {
    if (row.workshop_id) {
      upcomingWorkshopIds.add(row.workshop_id)
    }
  }

  const upcomingApprovedProfiles = await loadApprovedEnrollmentProfilesForWorkshops(upcomingWorkshopIds)
  const upcomingProfileIds = Array.from(upcomingApprovedProfiles)
  const providerByProfileId = await resolveProviderByProfileIds(upcomingProfileIds)

  const nearTermDemandByProvider: Record<GiftCardProvider, number> = { PC: 0, Sobeys: 0 }

  const upcomingDemandByProvider: Record<GiftCardProvider, number> = { PC: 0, Sobeys: 0 }
  for (const profileId of upcomingProfileIds) {
    const provider = providerByProfileId.get(profileId) ?? 'PC'
    if (!provider) continue
    upcomingDemandByProvider[provider] += 1
  }

  const providers = {
    PC: summarizeProviderInventory({
      provider: 'PC',
      statusCounts: statusByProvider.PC,
      threshold: thresholds.PC,
      nearTermDemand: nearTermDemandByProvider.PC,
      upcomingDemand: upcomingDemandByProvider.PC,
    }),
    Sobeys: summarizeProviderInventory({
      provider: 'Sobeys',
      statusCounts: statusByProvider.Sobeys,
      threshold: thresholds.Sobeys,
      nearTermDemand: nearTermDemandByProvider.Sobeys,
      upcomingDemand: upcomingDemandByProvider.Sobeys,
    }),
  } satisfies Record<GiftCardProvider, GiftCardProviderInventorySummary>

  const statusTotals = ASSET_STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = providers.PC.statusCounts[status] + providers.Sobeys.statusCounts[status]
      return acc
    },
    emptyStatusCounts()
  )

  return {
    generatedAt,
    horizonDays,
    providers,
    statusTotals,
    totals: {
      totalAssets: providers.PC.total + providers.Sobeys.total,
      totalAvailable: providers.PC.available + providers.Sobeys.available,
      totalNearTermDemand: providers.PC.nearTermDemand + providers.Sobeys.nearTermDemand,
      totalUpcomingDemand: providers.PC.upcomingDemand + providers.Sobeys.upcomingDemand,
      totalProjectedDemand: providers.PC.projectedDemand + providers.Sobeys.projectedDemand,
    },
  }
}

const countGiftCardAssets = async ({ provider, status }: { provider: GiftCardProvider; status: GiftCardAssetStatus }) => {
  const { count, error } = await adminClient
    .from('gift_card_asset')
    .select('id', { count: 'exact', head: true })
    .eq('provider', provider)
    .eq('status', status)

  if (error) {
    throw new Error(`Failed to count gift-card assets (${provider}/${status}): ${error.message}`)
  }
  return count ?? 0
}

const loadApprovedEnrollmentProfilesForWorkshops = async (workshopIds: Set<string>) => {
  const profiles = new Set<string>()
  const workshopIdList = Array.from(workshopIds)

  for (const workshopIdChunk of chunkArray(workshopIdList, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('workshop_enrollment')
      .select('profile_id')
      .in('workshop_id', workshopIdChunk)
      .eq('status', 'approved')

    if (error) {
      throw new Error(`Failed to load upcoming approved enrollments: ${error.message}`)
    }

    for (const row of data ?? []) {
      if (row.profile_id) {
        profiles.add(row.profile_id)
      }
    }
  }

  return profiles
}

const resolveProviderByProfileIds = async (profileIds: string[]) => {
  const normalizedProfileIds = Array.from(new Set(profileIds.filter(Boolean)))
  const providerByProfileId = new Map<string, GiftCardProvider | null>()
  if (!normalizedProfileIds.length) return providerByProfileId

  const profileRows: Array<{ id: string; user_id: string | null }> = []
  for (const chunk of chunkArray(normalizedProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient.from('profile').select('id, user_id').in('id', chunk)
    if (error) {
      throw new Error(`Failed to load profiles for provider preferences: ${error.message}`)
    }
    profileRows.push(...((data ?? []) as Array<{ id: string; user_id: string | null }>))
  }

  const targetProfileIds = new Set(normalizedProfileIds)
  const profileIdsByUserId = new Map<string, string[]>()
  for (const row of profileRows) {
    if (!row.user_id) continue
    const bucket = profileIdsByUserId.get(row.user_id) ?? []
    if (!bucket.includes(row.id)) {
      bucket.push(row.id)
      profileIdsByUserId.set(row.user_id, bucket)
    }
  }

  const submissionsById = new Map<string, { id: string; profile_id: string | null; user_id: string | null; submitted_at: string | null }>()

  for (const chunk of chunkArray(normalizedProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient.from('form_submission').select('id, profile_id, user_id, submitted_at').in('profile_id', chunk)
    if (error) {
      throw new Error(`Failed to load profile form submissions for provider preferences: ${error.message}`)
    }
    for (const row of data ?? []) {
      submissionsById.set(row.id, row)
    }
  }

  const userIds = Array.from(profileIdsByUserId.keys())
  for (const chunk of chunkArray(userIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient.from('form_submission').select('id, profile_id, user_id, submitted_at').in('user_id', chunk)
    if (error) {
      throw new Error(`Failed to load user form submissions for provider preferences: ${error.message}`)
    }
    for (const row of data ?? []) {
      submissionsById.set(row.id, row)
    }
  }

  const latestValueByProfileId = new Map<string, { value: string; submittedAtMs: number }>()
  const submissionIds = Array.from(submissionsById.keys())

  for (const chunk of chunkArray(submissionIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: answerRows, error: answerError } = await adminClient
      .from('form_answer')
      .select('submission_id, value')
      .eq('question_code', GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE)
      .in('submission_id', chunk)

    if (answerError) {
      throw new Error(`Failed to load provider preference answers: ${answerError.message}`)
    }

    for (const answer of answerRows ?? []) {
      const submission = submissionsById.get(answer.submission_id)
      if (!submission) continue
      const value = typeof answer.value === 'string' ? answer.value.trim() : ''
      if (!value) continue

      const submittedAtMs = Number.isFinite(Date.parse(submission.submitted_at ?? '')) ? Date.parse(submission.submitted_at ?? '') : 0
      const associatedProfileIds = new Set<string>()

      if (submission.profile_id && targetProfileIds.has(submission.profile_id)) {
        associatedProfileIds.add(submission.profile_id)
      }

      if (submission.user_id) {
        for (const profileId of profileIdsByUserId.get(submission.user_id) ?? []) {
          if (targetProfileIds.has(profileId)) {
            associatedProfileIds.add(profileId)
          }
        }
      }

      for (const profileId of associatedProfileIds) {
        const existing = latestValueByProfileId.get(profileId)
        if (!existing || submittedAtMs > existing.submittedAtMs) {
          latestValueByProfileId.set(profileId, { value, submittedAtMs })
        }
      }
    }
  }

  for (const profileId of normalizedProfileIds) {
    const preferenceValue = latestValueByProfileId.get(profileId)?.value ?? null
    providerByProfileId.set(profileId, parseGiftCardProviderFromDisplay(preferenceValue))
  }

  return providerByProfileId
}

const summarizeProviderInventory = ({
  provider,
  statusCounts,
  threshold,
  nearTermDemand,
  upcomingDemand,
}: {
  provider: GiftCardProvider
  statusCounts: Record<GiftCardAssetStatus, number>
  threshold: number
  nearTermDemand: number
  upcomingDemand: number
}): GiftCardProviderInventorySummary => {
  const total = ASSET_STATUS_ORDER.reduce((acc, status) => acc + statusCounts[status], 0)
  const available = statusCounts.available
  const projectedDemand = nearTermDemand + upcomingDemand
  const projectedShortfall = Math.max(0, projectedDemand - available)
  return {
    provider,
    statusCounts,
    total,
    available,
    threshold,
    isLow: available <= threshold,
    nearTermDemand,
    upcomingDemand,
    projectedDemand,
    projectedShortfall,
  }
}

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}
