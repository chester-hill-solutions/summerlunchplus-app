import { loadWorkshopEnrollmentEnrichment } from '@/routes/manage/workshop-enrollment-enrichment.server'

import { scanByIdKeyset } from '@/lib/supabase/keyset-pagination.server'
import { adminClient } from '@/lib/supabase/adminClient'

export type GiftCardProvider = 'PC' | 'Sobeys'

type GiftCardAssetStatus = 'available' | 'allocated' | 'sent' | 'opened' | 'used' | 'invalid'

const PAGE_SIZE = 500
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

const allocationPairKey = (classId: string, profileId: string) => `${classId}::${profileId}`

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

  await scanByIdKeyset<{ id: string; provider: GiftCardProvider; status: GiftCardAssetStatus }>({
    batchSize: PAGE_SIZE,
    fetchPage: async afterId => {
      const query = adminClient
        .from('gift_card_asset')
        .select('id, provider, status')
        .order('id', { ascending: true })
        .limit(PAGE_SIZE)

      const { data, error } = afterId ? await query.gt('id', afterId) : await query
      if (error) {
        throw new Error(`Failed to load gift-card inventory rows: ${error.message}`)
      }

      return (data ?? []) as Array<{ id: string; provider: GiftCardProvider; status: GiftCardAssetStatus }>
    },
    onPage: rows => {
      for (const row of rows) {
        const provider = row.provider === 'Sobeys' ? 'Sobeys' : 'PC'
        const status = ASSET_STATUS_ORDER.includes(row.status) ? row.status : 'invalid'
        statusByProvider[provider][status] += 1
      }
    },
  })

  const candidatePairs = new Set<string>()
  const nearTermPairs: Array<{ classId: string; profileId: string }> = []

  await scanByIdKeyset<{ id: string; class_id: string; profile_id: string }>({
    batchSize: PAGE_SIZE,
    fetchPage: async afterId => {
      const query = adminClient
        .from('class_attendance')
        .select('id, class_id, profile_id')
        .eq('gift_card_blocked', false)
        .or('camera_on.eq.true,photo_status.eq.accepted,photo_status.eq.uploaded')
        .order('id', { ascending: true })
        .limit(PAGE_SIZE)

      const { data, error } = afterId ? await query.gt('id', afterId) : await query
      if (error) {
        throw new Error(`Failed to load near-term demand attendance rows: ${error.message}`)
      }

      return (data ?? []) as Array<{ id: string; class_id: string; profile_id: string }>
    },
    onPage: rows => {
      for (const row of rows) {
        const key = allocationPairKey(row.class_id, row.profile_id)
        if (!candidatePairs.has(key)) {
          candidatePairs.add(key)
          nearTermPairs.push({ classId: row.class_id, profileId: row.profile_id })
        }
      }
    },
  })

  if (candidatePairs.size) {
    await scanByIdKeyset<{ id: string; class_id: string; profile_id: string }>({
      batchSize: PAGE_SIZE,
      fetchPage: async afterId => {
        const query = adminClient
          .from('gift_card_allocation')
          .select('id, class_id, profile_id')
          .order('id', { ascending: true })
          .limit(PAGE_SIZE)

        const { data, error } = afterId ? await query.gt('id', afterId) : await query
        if (error) {
          throw new Error(`Failed to load allocations for near-term demand: ${error.message}`)
        }

        return (data ?? []) as Array<{ id: string; class_id: string; profile_id: string }>
      },
      onPage: rows => {
        for (const row of rows) {
          candidatePairs.delete(allocationPairKey(row.class_id, row.profile_id))
        }
      },
    })
  }

  const unresolvedNearTermPairs = nearTermPairs.filter(pair => candidatePairs.has(allocationPairKey(pair.classId, pair.profileId)))

  const now = new Date()
  const horizonEnd = new Date(now)
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizonDays)
  const nowIso = now.toISOString()
  const horizonEndIso = horizonEnd.toISOString()

  const upcomingWorkshopIds = new Set<string>()
  await scanByIdKeyset<{ id: string; workshop_id: string | null }>({
    batchSize: PAGE_SIZE,
    fetchPage: async afterId => {
      const query = adminClient
        .from('class')
        .select('id, workshop_id')
        .gte('starts_at', nowIso)
        .lte('starts_at', horizonEndIso)
        .order('id', { ascending: true })
        .limit(PAGE_SIZE)

      const { data, error } = afterId ? await query.gt('id', afterId) : await query
      if (error) {
        throw new Error(`Failed to load upcoming classes for demand projection: ${error.message}`)
      }

      return (data ?? []) as Array<{ id: string; workshop_id: string | null }>
    },
    onPage: rows => {
      for (const row of rows) {
        if (row.workshop_id) {
          upcomingWorkshopIds.add(row.workshop_id)
        }
      }
    },
  })

  const upcomingApprovedProfiles = new Set<string>()
  const workshopIdList = Array.from(upcomingWorkshopIds)
  for (const workshopIdChunk of chunkArray(workshopIdList, 200)) {
    if (!workshopIdChunk.length) continue

    await scanByIdKeyset<{ id: string; profile_id: string | null }>({
      batchSize: PAGE_SIZE,
      fetchPage: async afterId => {
        const query = adminClient
          .from('workshop_enrollment')
          .select('id, profile_id')
          .in('workshop_id', workshopIdChunk)
          .eq('status', 'approved')
          .order('id', { ascending: true })
          .limit(PAGE_SIZE)

        const { data, error } = afterId ? await query.gt('id', afterId) : await query
        if (error) {
          throw new Error(`Failed to load upcoming approved enrollments: ${error.message}`)
        }

        return (data ?? []) as Array<{ id: string; profile_id: string | null }>
      },
      onPage: rows => {
        for (const row of rows) {
          if (row.profile_id) {
            upcomingApprovedProfiles.add(row.profile_id)
          }
        }
      },
    })
  }

  const nearTermProfileIds = new Set(unresolvedNearTermPairs.map(pair => pair.profileId))
  const upcomingProfileIds = Array.from(upcomingApprovedProfiles).filter(profileId => !nearTermProfileIds.has(profileId))
  const profileIdsForProviderLookup = Array.from(new Set([...nearTermProfileIds, ...upcomingProfileIds]))
  const enrichmentByProfileId = profileIdsForProviderLookup.length
    ? await loadWorkshopEnrollmentEnrichment(profileIdsForProviderLookup)
    : {}

  const nearTermDemandByProvider: Record<GiftCardProvider, number> = { PC: 0, Sobeys: 0 }
  for (const pair of unresolvedNearTermPairs) {
    const provider = parseGiftCardProviderFromDisplay(enrichmentByProfileId[pair.profileId]?.giftcard_display)
    if (!provider) continue
    nearTermDemandByProvider[provider] += 1
  }

  const upcomingDemandByProvider: Record<GiftCardProvider, number> = { PC: 0, Sobeys: 0 }
  for (const profileId of upcomingProfileIds) {
    const provider = parseGiftCardProviderFromDisplay(enrichmentByProfileId[profileId]?.giftcard_display)
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
