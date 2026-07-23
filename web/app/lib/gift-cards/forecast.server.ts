import { adminClient } from '@/lib/supabase/adminClient'
import { parseGiftCardProviderFromDisplay } from '@/lib/gift-cards/inventory.server'

const TORONTO_TIME_ZONE = 'America/Toronto'
const IN_CLAUSE_BATCH_SIZE = 100
const RELATIONSHIP_BATCH_SIZE = 100

export type ForecastWindowDays = 7 | 14
export type GiftCardProvider = 'PC' | 'Sobeys'
export type GiftCardPreferenceBucket = GiftCardProvider | 'meal_kit'

type PreferenceCounts = {
  profiles: number
  families: number
}

export type WindowSnapshot = {
  days: ForecastWindowDays
  accepted: {
    totalProfiles: number
    totalFamilies: number
    byPreference: Record<GiftCardPreferenceBucket, PreferenceCounts>
  }
  allocation: Record<
    GiftCardProvider,
    {
      eligibleProfiles: number
      eligibleFamilies: number
      allocatedProfiles: number
      allocatedFamilies: number
      blockedProfiles: number
      pendingProfiles: number
      pendingFamilies: number
    }
  >
  inventory: Record<
    GiftCardProvider,
    {
      available: number
      allocated: number
      sent: number
      opened: number
      leftAfterPending: number
      shortfallNow: number
    }
  >
}

export type GiftCardAllocationForecastSnapshot = {
  generatedAt: string
  timezone: typeof TORONTO_TIME_ZONE
  windows: {
    d7: WindowSnapshot
    d14: WindowSnapshot
  }
}

type ClassScopeRow = {
  id: string
  workshop_id: string | null
}

type EnrollmentRow = {
  profile_id: string | null
}

type AllocationRow = {
  profile_id: string | null
}

type BlockedAttendanceRow = {
  profile_id: string | null
}

type FamilyEdgeRow = {
  guardian_profile_id: string
  child_profile_id: string
}

type ProfileUserRow = {
  id: string
  user_id: string | null
  federal_electoral_district_name: string | null
}

type RidingRow = {
  name: string
  meal_kit: boolean
}

type FormSubmissionRow = {
  id: string
  profile_id: string | null
  user_id: string | null
  submitted_at: string | null
}

type FormAnswerRow = {
  submission_id: string
  value: unknown
}

type AssetStatus = 'available' | 'allocated' | 'sent' | 'opened'
type AssetCountResult = Record<GiftCardProvider, Record<AssetStatus, number>>

const unique = <T,>(items: T[]) => Array.from(new Set(items))

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0 || items.length === 0) return []
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

const emptyPreferenceCounts = (): PreferenceCounts => ({
  profiles: 0,
  families: 0,
})

const emptyPreferenceMap = (): Record<GiftCardPreferenceBucket, PreferenceCounts> => ({
  PC: emptyPreferenceCounts(),
  Sobeys: emptyPreferenceCounts(),
  meal_kit: emptyPreferenceCounts(),
})

const emptyProviderAllocation = () => ({
  eligibleProfiles: 0,
  eligibleFamilies: 0,
  allocatedProfiles: 0,
  allocatedFamilies: 0,
  blockedProfiles: 0,
  pendingProfiles: 0,
  pendingFamilies: 0,
})

const emptyProviderInventory = () => ({
  available: 0,
  allocated: 0,
  sent: 0,
  opened: 0,
  leftAfterPending: 0,
  shortfallNow: 0,
})

const mapGiftCardDisplayToBucket = (giftcardDisplay: string | null | undefined): GiftCardPreferenceBucket => {
  const normalized = (giftcardDisplay ?? '').trim().toLowerCase()
  if (normalized.includes('meal kit')) return 'meal_kit'
  if (normalized.includes('sobeys')) return 'Sobeys'
  return 'PC'
}

const toValidDateMs = (value: string | null | undefined) => {
  const parsed = Date.parse((value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

const toFamilySet = (profileIds: Iterable<string>, familyIdByProfileId: Map<string, string>): Set<string> => {
  const set = new Set<string>()
  for (const profileId of profileIds) {
    set.add(familyIdByProfileId.get(profileId) ?? profileId)
  }
  return set
}

const buildPreferenceSets = (
  profileIds: string[],
  preferenceByProfileId: Map<string, GiftCardPreferenceBucket>
): Record<GiftCardPreferenceBucket, Set<string>> => {
  const sets: Record<GiftCardPreferenceBucket, Set<string>> = {
    PC: new Set<string>(),
    Sobeys: new Set<string>(),
    meal_kit: new Set<string>(),
  }

  for (const profileId of profileIds) {
    const bucket = preferenceByProfileId.get(profileId) ?? 'PC'
    sets[bucket].add(profileId)
  }

  return sets
}

const loadWindowScope = async (days: ForecastWindowDays): Promise<{ classIds: string[]; workshopIds: string[] }> => {
  const now = new Date()
  const end = new Date(now)
  end.setUTCDate(end.getUTCDate() + days)

  const { data, error } = await adminClient
    .from('class')
    .select('id, workshop_id')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', end.toISOString())

  if (error) {
    throw new Error(`Failed to load class scope for ${days}d window: ${error.message}`)
  }

  const rows = (data ?? []) as ClassScopeRow[]
  return {
    classIds: unique(rows.map(row => row.id).filter(Boolean)),
    workshopIds: unique(rows.map(row => row.workshop_id).filter((id): id is string => Boolean(id))),
  }
}

const loadApprovedProfiles = async (workshopIds: string[]): Promise<string[]> => {
  if (!workshopIds.length) return []

  const profileIds = new Set<string>()
  for (const chunk of chunkArray(workshopIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('workshop_enrollment')
      .select('profile_id')
      .in('workshop_id', chunk)
      .eq('status', 'approved')

    if (error) {
      throw new Error(`Failed to load approved enrollments: ${error.message}`)
    }

    for (const row of (data ?? []) as EnrollmentRow[]) {
      if (row.profile_id) profileIds.add(row.profile_id)
    }
  }

  return Array.from(profileIds)
}

const loadPreferenceByProfileId = async (profileIds: string[]): Promise<Map<string, GiftCardPreferenceBucket>> => {
  const byProfileId = new Map<string, GiftCardPreferenceBucket>()
  if (!profileIds.length) return byProfileId

  const normalizedProfileIds = unique(profileIds.filter(Boolean))
  const profiles: ProfileUserRow[] = []
  for (const chunk of chunkArray(normalizedProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, user_id, federal_electoral_district_name')
      .in('id', chunk)

    if (error) {
      throw new Error(`Failed to load profiles for gift-card preference buckets: ${error.message}`)
    }

    profiles.push(...((data ?? []) as ProfileUserRow[]))
  }

  const ridingNames = unique(
    profiles
      .map(profile => (profile.federal_electoral_district_name ?? '').trim())
      .filter(Boolean)
  )

  const mealKitRidingNames = new Set<string>()
  for (const chunk of chunkArray(ridingNames, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('federal_electoral_district')
      .select('name, meal_kit')
      .in('name', chunk)

    if (error) {
      throw new Error(`Failed to load federal district meal-kit flags: ${error.message}`)
    }

    for (const row of (data ?? []) as RidingRow[]) {
      if (row.meal_kit) mealKitRidingNames.add(row.name)
    }
  }

  const profilesByUserId = new Map<string, string[]>()
  const targetProfileIdSet = new Set(normalizedProfileIds)
  const mealKitProfiles = new Set<string>()
  for (const profile of profiles) {
    if (profile.user_id) {
      const bucket = profilesByUserId.get(profile.user_id) ?? []
      if (!bucket.includes(profile.id)) {
        bucket.push(profile.id)
        profilesByUserId.set(profile.user_id, bucket)
      }
    }

    const ridingName = (profile.federal_electoral_district_name ?? '').trim()
    if (ridingName && mealKitRidingNames.has(ridingName)) {
      mealKitProfiles.add(profile.id)
    }
  }

  const submissionsById = new Map<string, FormSubmissionRow>()
  for (const chunk of chunkArray(normalizedProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('profile_id', chunk)

    if (error) {
      throw new Error(`Failed to load profile form submissions for gift-card preference buckets: ${error.message}`)
    }

    for (const row of (data ?? []) as FormSubmissionRow[]) {
      submissionsById.set(row.id, row)
    }
  }

  const userIds = Array.from(profilesByUserId.keys())
  for (const chunk of chunkArray(userIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('user_id', chunk)

    if (error) {
      throw new Error(`Failed to load user form submissions for gift-card preference buckets: ${error.message}`)
    }

    for (const row of (data ?? []) as FormSubmissionRow[]) {
      submissionsById.set(row.id, row)
    }
  }

  const latestValueByProfileId = new Map<string, { value: string; submittedAtMs: number }>()
  const submissionIds = Array.from(submissionsById.keys())
  for (const chunk of chunkArray(submissionIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: answerRows, error: answerError } = await adminClient
      .from('form_answer')
      .select('submission_id, value')
      .eq('question_code', 'gift_card_store_preference')
      .in('submission_id', chunk)

    if (answerError) {
      throw new Error(`Failed to load gift-card preference answers for buckets: ${answerError.message}`)
    }

    for (const answer of (answerRows ?? []) as FormAnswerRow[]) {
      const submission = submissionsById.get(answer.submission_id)
      if (!submission) continue

      const value = typeof answer.value === 'string' ? answer.value.trim() : ''
      if (!value) continue

      const submittedAtMs = toValidDateMs(submission.submitted_at)
      const associatedProfileIds = new Set<string>()

      if (submission.profile_id && targetProfileIdSet.has(submission.profile_id)) {
        associatedProfileIds.add(submission.profile_id)
      }

      if (submission.user_id) {
        for (const relatedProfileId of profilesByUserId.get(submission.user_id) ?? []) {
          if (targetProfileIdSet.has(relatedProfileId)) {
            associatedProfileIds.add(relatedProfileId)
          }
        }
      }

      for (const associatedProfileId of associatedProfileIds) {
        const existing = latestValueByProfileId.get(associatedProfileId)
        if (!existing || submittedAtMs > existing.submittedAtMs) {
          latestValueByProfileId.set(associatedProfileId, { value, submittedAtMs })
        }
      }
    }
  }

  for (const profileId of normalizedProfileIds) {
    if (mealKitProfiles.has(profileId)) {
      byProfileId.set(profileId, 'meal_kit')
      continue
    }

    const preferenceValue = latestValueByProfileId.get(profileId)?.value ?? null
    const provider = parseGiftCardProviderFromDisplay(preferenceValue)
    byProfileId.set(profileId, provider ? provider : 'meal_kit')
  }

  return byProfileId
}

const loadFamilyIdByProfileId = async (profileIds: string[]): Promise<Map<string, string>> => {
  const normalized = unique(profileIds.filter(Boolean))
  const familyIdByProfileId = new Map<string, string>()
  if (!normalized.length) return familyIdByProfileId

  const seen = new Set<string>(normalized)
  const queue = [...normalized]
  const edges: FamilyEdgeRow[] = []

  while (queue.length) {
    const batch = queue.splice(0, Math.min(queue.length, RELATIONSHIP_BATCH_SIZE))
    const inClause = batch.join(',')
    if (!inClause) continue

    const { data, error } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id')
      .or(`guardian_profile_id.in.(${inClause}),child_profile_id.in.(${inClause})`)

    if (error) {
      throw new Error(`Failed to load family edges: ${error.message}`)
    }

    for (const edge of (data ?? []) as FamilyEdgeRow[]) {
      edges.push(edge)
      if (!seen.has(edge.guardian_profile_id)) {
        seen.add(edge.guardian_profile_id)
        queue.push(edge.guardian_profile_id)
      }
      if (!seen.has(edge.child_profile_id)) {
        seen.add(edge.child_profile_id)
        queue.push(edge.child_profile_id)
      }
    }
  }

  const adjacency = new Map<string, Set<string>>()
  for (const id of seen) adjacency.set(id, new Set<string>())
  for (const edge of edges) {
    adjacency.get(edge.guardian_profile_id)?.add(edge.child_profile_id)
    adjacency.get(edge.child_profile_id)?.add(edge.guardian_profile_id)
  }

  const visited = new Set<string>()
  for (const id of seen) {
    if (visited.has(id)) continue

    const component: string[] = []
    const bfs = [id]
    visited.add(id)

    while (bfs.length) {
      const current = bfs.shift() as string
      component.push(current)
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          bfs.push(neighbor)
        }
      }
    }

    component.sort((a, b) => a.localeCompare(b))
    const familyId = component[0]
    for (const member of component) {
      familyIdByProfileId.set(member, familyId)
    }
  }

  for (const profileId of normalized) {
    if (!familyIdByProfileId.has(profileId)) {
      familyIdByProfileId.set(profileId, profileId)
    }
  }

  return familyIdByProfileId
}

const loadAllocatedProfileIds = async (classIds: string[], profileIds: string[]): Promise<Set<string>> => {
  const allocated = new Set<string>()
  if (!classIds.length || !profileIds.length) return allocated

  const eligibleProfileSet = new Set(profileIds)
  for (const classChunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient.from('gift_card_allocation').select('profile_id').in('class_id', classChunk)
    if (error) {
      throw new Error(`Failed to load gift card allocations: ${error.message}`)
    }

    for (const row of (data ?? []) as AllocationRow[]) {
      if (row.profile_id && eligibleProfileSet.has(row.profile_id)) {
        allocated.add(row.profile_id)
      }
    }
  }

  return allocated
}

const loadBlockedProfileIds = async (classIds: string[], profileIds: string[]): Promise<Set<string>> => {
  const blocked = new Set<string>()
  if (!classIds.length || !profileIds.length) return blocked

  const eligibleProfileSet = new Set(profileIds)
  for (const classChunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('class_attendance')
      .select('profile_id')
      .in('class_id', classChunk)
      .eq('gift_card_blocked', true)

    if (error) {
      throw new Error(`Failed to load blocked attendance rows: ${error.message}`)
    }

    for (const row of (data ?? []) as BlockedAttendanceRow[]) {
      if (row.profile_id && eligibleProfileSet.has(row.profile_id)) {
        blocked.add(row.profile_id)
      }
    }
  }

  return blocked
}

const loadInventoryCounts = async (): Promise<AssetCountResult> => {
  const result: AssetCountResult = {
    PC: { available: 0, allocated: 0, sent: 0, opened: 0 },
    Sobeys: { available: 0, allocated: 0, sent: 0, opened: 0 },
  }

  const providers: GiftCardProvider[] = ['PC', 'Sobeys']
  const statuses: AssetStatus[] = ['available', 'allocated', 'sent', 'opened']

  for (const provider of providers) {
    for (const status of statuses) {
      const { count, error } = await adminClient
        .from('gift_card_asset')
        .select('id', { count: 'exact', head: true })
        .eq('provider', provider)
        .eq('status', status)

      if (error) {
        throw new Error(`Failed inventory count (${provider}/${status}): ${error.message}`)
      }

      result[provider][status] = count ?? 0
    }
  }

  return result
}

const buildWindowSnapshot = async (days: ForecastWindowDays): Promise<WindowSnapshot> => {
  const { classIds, workshopIds } = await loadWindowScope(days)
  const approvedProfiles = await loadApprovedProfiles(workshopIds)
  const preferenceByProfileId = await loadPreferenceByProfileId(approvedProfiles)
  const familyIdByProfileId = await loadFamilyIdByProfileId(approvedProfiles)
  const allocatedProfiles = await loadAllocatedProfileIds(classIds, approvedProfiles)
  const blockedProfiles = await loadBlockedProfileIds(classIds, approvedProfiles)
  const inventoryCounts = await loadInventoryCounts()

  const profilesByPreference = buildPreferenceSets(approvedProfiles, preferenceByProfileId)
  const acceptedByPreference = emptyPreferenceMap()
  for (const bucket of ['PC', 'Sobeys', 'meal_kit'] as const) {
    acceptedByPreference[bucket] = {
      profiles: profilesByPreference[bucket].size,
      families: toFamilySet(profilesByPreference[bucket], familyIdByProfileId).size,
    }
  }

  const allocation: WindowSnapshot['allocation'] = {
    PC: emptyProviderAllocation(),
    Sobeys: emptyProviderAllocation(),
  }

  for (const provider of ['PC', 'Sobeys'] as const) {
    const eligibleProfiles = profilesByPreference[provider]
    const allocatedEligibleProfiles = new Set<string>()
    const blockedEligibleProfiles = new Set<string>()

    for (const profileId of eligibleProfiles) {
      if (allocatedProfiles.has(profileId)) allocatedEligibleProfiles.add(profileId)
      if (blockedProfiles.has(profileId)) blockedEligibleProfiles.add(profileId)
    }

    const pendingProfiles = new Set<string>()
    for (const profileId of eligibleProfiles) {
      if (!allocatedEligibleProfiles.has(profileId)) {
        pendingProfiles.add(profileId)
      }
    }

    allocation[provider] = {
      eligibleProfiles: eligibleProfiles.size,
      eligibleFamilies: toFamilySet(eligibleProfiles, familyIdByProfileId).size,
      allocatedProfiles: allocatedEligibleProfiles.size,
      allocatedFamilies: toFamilySet(allocatedEligibleProfiles, familyIdByProfileId).size,
      blockedProfiles: blockedEligibleProfiles.size,
      pendingProfiles: pendingProfiles.size,
      pendingFamilies: toFamilySet(pendingProfiles, familyIdByProfileId).size,
    }
  }

  const inventory: WindowSnapshot['inventory'] = {
    PC: emptyProviderInventory(),
    Sobeys: emptyProviderInventory(),
  }

  for (const provider of ['PC', 'Sobeys'] as const) {
    const available = inventoryCounts[provider].available
    const pending = allocation[provider].pendingProfiles
    inventory[provider] = {
      available,
      allocated: inventoryCounts[provider].allocated,
      sent: inventoryCounts[provider].sent,
      opened: inventoryCounts[provider].opened,
      leftAfterPending: available - pending,
      shortfallNow: Math.max(0, pending - available),
    }
  }

  return {
    days,
    accepted: {
      totalProfiles: approvedProfiles.length,
      totalFamilies: toFamilySet(approvedProfiles, familyIdByProfileId).size,
      byPreference: acceptedByPreference,
    },
    allocation,
    inventory,
  }
}

export const loadGiftCardAllocationForecastSnapshot = async (): Promise<GiftCardAllocationForecastSnapshot> => {
  const [d7, d14] = await Promise.all([buildWindowSnapshot(7), buildWindowSnapshot(14)])

  return {
    generatedAt: new Date().toISOString(),
    timezone: TORONTO_TIME_ZONE,
    windows: {
      d7,
      d14,
    },
  }
}
