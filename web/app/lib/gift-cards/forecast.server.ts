import { adminClient } from '@/lib/supabase/adminClient'
import { loadWorkshopEnrollmentEnrichment } from '@/routes/manage/workshop-enrollment-enrichment.server'

const TORONTO_TIME_ZONE = 'America/Toronto'
const IN_CLAUSE_BATCH_SIZE = 10
const RELATIONSHIP_BATCH_SIZE = 10

export type GiftCardProvider = 'PC' | 'Sobeys'

type ClassScopeRow = {
  id: string
  workshop_id: string | null
}

type AttendanceRow = {
  class_id: string
  profile_id: string | null
  state: 'active' | 'inactive' | null
  camera_on: boolean | null
  photo_status: 'uploaded' | 'accepted' | 'rejected' | 'expired' | null
  gift_card_blocked: boolean | null
}

type AllocationRow = {
  class_id: string
  profile_id: string | null
  asset: { provider: GiftCardProvider } | Array<{ provider: GiftCardProvider }> | null
}

type FamilyEdgeRow = {
  guardian_profile_id: string
  child_profile_id: string
}

export type GiftCardWeekRange = {
  startsAt: string
  endsAt: string
}

export type GiftCardWeekSnapshot = GiftCardWeekRange & {
  acceptedFamilies: Record<GiftCardProvider, number>
  allocated: Record<GiftCardProvider, number>
  stillNeeded: Record<GiftCardProvider, number>
}

export type GiftCardAllocationForecastSnapshot = {
  generatedAt: string
  timezone: typeof TORONTO_TIME_ZONE
  available: Record<GiftCardProvider, number>
  weeks: [GiftCardWeekSnapshot, GiftCardWeekSnapshot, GiftCardWeekSnapshot]
}

const providers: GiftCardProvider[] = ['PC', 'Sobeys']
const weekdayIndexByLabel: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const torontoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TORONTO_TIME_ZONE,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const unique = <T,>(items: T[]) => Array.from(new Set(items))

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

const emptyProviderCounts = (): Record<GiftCardProvider, number> => ({ PC: 0, Sobeys: 0 })

const torontoPartsForDate = (date: Date) => {
  const parts = torontoDateFormatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return {
    weekday: get('weekday'),
    year: Number.parseInt(get('year'), 10),
    month: Number.parseInt(get('month'), 10),
    day: Number.parseInt(get('day'), 10),
  }
}

const addDays = (year: number, month: number, day: number, days: number) => {
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

const torontoMidnightIso = (year: number, month: number, day: number) => {
  for (let hour = 0; hour < 24; hour += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour))
    const local = torontoPartsForDate(candidate)
    if (local.year === year && local.month === month && local.day === day) return candidate.toISOString()
  }
  throw new Error(`Unable to resolve Toronto midnight for ${year}-${month}-${day}`)
}

export const buildGiftCardWeekRanges = (now = new Date()): [GiftCardWeekRange, GiftCardWeekRange, GiftCardWeekRange] => {
  const local = torontoPartsForDate(now)
  const weekday = weekdayIndexByLabel[local.weekday]
  const thisSunday = addDays(local.year, local.month, local.day, -weekday)

  return [0, 7, 14].map(days => {
    const start = addDays(thisSunday.year, thisSunday.month, thisSunday.day, days)
    const end = addDays(start.year, start.month, start.day, 7)
    return {
      startsAt: torontoMidnightIso(start.year, start.month, start.day),
      endsAt: torontoMidnightIso(end.year, end.month, end.day),
    }
  }) as [GiftCardWeekRange, GiftCardWeekRange, GiftCardWeekRange]
}

const allocationKey = (classId: string, profileId: string) => `${classId}::${profileId}`

const providerFromDisplay = (value: string | null | undefined): GiftCardProvider | null => {
  const normalized = (value ?? '').trim().toLowerCase()
  const compact = normalized.replace(/[^a-z0-9]+/g, '')
  if (compact.includes('mealkit') || normalized.includes('meal kit')) return null
  return compact.includes('sobeys') || normalized.includes('sobeys') || normalized.includes("sobey's") ? 'Sobeys' : 'PC'
}

const loadWeekScope = async ({ startsAt, endsAt }: GiftCardWeekRange) => {
  const { data, error } = await adminClient
    .from('class')
    .select('id, workshop_id')
    .gte('starts_at', startsAt)
    .lt('starts_at', endsAt)

  if (error) throw new Error(`Failed to load weekly class scope: ${error.message}`)

  const rows = (data ?? []) as ClassScopeRow[]
  return {
    classIds: unique(rows.map(row => row.id)),
    workshopIds: unique(rows.map(row => row.workshop_id).filter((id): id is string => Boolean(id))),
  }
}

const loadApprovedProfiles = async (workshopIds: string[]) => {
  const profileIds = new Set<string>()
  for (const chunk of chunkArray(workshopIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('workshop_enrollment')
      .select('profile_id')
      .in('workshop_id', chunk)
      .eq('status', 'approved')
    if (error) throw new Error(`Failed to load approved enrollments: ${error.message}`)
    for (const row of data ?? []) if (row.profile_id) profileIds.add(row.profile_id)
  }
  return Array.from(profileIds)
}

const loadAttendanceRows = async (classIds: string[]) => {
  const rows: AttendanceRow[] = []
  for (const chunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('class_attendance')
      .select('class_id, profile_id, state, camera_on, photo_status, gift_card_blocked')
      .in('class_id', chunk)
    if (error) throw new Error(`Failed to load attendance rows: ${error.message}`)
    rows.push(...((data ?? []) as AttendanceRow[]))
  }
  return rows
}

const loadAllocations = async (classIds: string[]) => {
  const rows: AllocationRow[] = []
  for (const chunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('gift_card_allocation')
      .select('class_id, profile_id, asset:gift_card_asset_id(provider)')
      .in('class_id', chunk)
    if (error) throw new Error(`Failed to load gift-card allocations: ${error.message}`)
    rows.push(...((data ?? []) as AllocationRow[]))
  }
  return rows
}

const loadFamilyIdByProfileId = async (profileIds: string[]) => {
  const seen = new Set(profileIds)
  const queue = [...seen]
  const edges: FamilyEdgeRow[] = []

  while (queue.length) {
    const batch = queue.splice(0, RELATIONSHIP_BATCH_SIZE)
    const [guardianQuery, childQuery] = await Promise.all([
      adminClient.from('person_guardian_child').select('guardian_profile_id, child_profile_id').in('guardian_profile_id', batch),
      adminClient.from('person_guardian_child').select('guardian_profile_id, child_profile_id').in('child_profile_id', batch),
    ])
    if (guardianQuery.error) throw new Error(`Failed to load family guardians: ${guardianQuery.error.message}`)
    if (childQuery.error) throw new Error(`Failed to load family children: ${childQuery.error.message}`)

    for (const edge of [...(guardianQuery.data ?? []), ...(childQuery.data ?? [])] as FamilyEdgeRow[]) {
      edges.push(edge)
      for (const profileId of [edge.guardian_profile_id, edge.child_profile_id]) {
        if (!seen.has(profileId)) {
          seen.add(profileId)
          queue.push(profileId)
        }
      }
    }
  }

  const adjacent = new Map<string, Set<string>>()
  for (const profileId of seen) adjacent.set(profileId, new Set())
  for (const edge of edges) {
    adjacent.get(edge.guardian_profile_id)?.add(edge.child_profile_id)
    adjacent.get(edge.child_profile_id)?.add(edge.guardian_profile_id)
  }

  const familyIdByProfileId = new Map<string, string>()
  for (const profileId of seen) {
    if (familyIdByProfileId.has(profileId)) continue
    const component = [profileId]
    const members: string[] = []
    while (component.length) {
      const current = component.pop() as string
      if (familyIdByProfileId.has(current)) continue
      familyIdByProfileId.set(current, profileId)
      members.push(current)
      for (const next of adjacent.get(current) ?? []) component.push(next)
    }
    const familyId = members.sort((left, right) => left.localeCompare(right))[0]
    for (const member of members) familyIdByProfileId.set(member, familyId)
  }
  return familyIdByProfileId
}

const loadAvailableCounts = async () => {
  const available = emptyProviderCounts()
  await Promise.all(
    providers.map(async provider => {
      const { count, error } = await adminClient
        .from('gift_card_asset')
        .select('id', { count: 'exact', head: true })
        .eq('provider', provider)
        .eq('status', 'available')
      if (error) throw new Error(`Failed to count available ${provider} cards: ${error.message}`)
      available[provider] = count ?? 0
    })
  )
  return available
}

const buildWeekSnapshot = async (range: GiftCardWeekRange): Promise<GiftCardWeekSnapshot> => {
  const { classIds, workshopIds } = await loadWeekScope(range)
  const [approvedProfiles, attendanceRows, allocations] = await Promise.all([
    loadApprovedProfiles(workshopIds),
    loadAttendanceRows(classIds),
    loadAllocations(classIds),
  ])
  const attendanceProfileIds = attendanceRows.map(row => row.profile_id).filter((id): id is string => Boolean(id))
  const profileIds = unique([...approvedProfiles, ...attendanceProfileIds])
  const [enrichment, familyIdByProfileId] = await Promise.all([
    loadWorkshopEnrollmentEnrichment(profileIds),
    loadFamilyIdByProfileId(profileIds),
  ])
  const providerByProfileId = new Map(profileIds.map(id => [id, providerFromDisplay(enrichment[id]?.giftcard_display)]))

  const acceptedFamilies = emptyProviderCounts()
  for (const provider of providers) {
    const families = new Set<string>()
    for (const profileId of approvedProfiles) {
      if (providerByProfileId.get(profileId) === provider) families.add(familyIdByProfileId.get(profileId) ?? profileId)
    }
    acceptedFamilies[provider] = families.size
  }

  const allocated = emptyProviderCounts()
  const allocatedPairs = new Set<string>()
  for (const allocation of allocations) {
    if (!allocation.profile_id) continue
    allocatedPairs.add(allocationKey(allocation.class_id, allocation.profile_id))
    const asset = Array.isArray(allocation.asset) ? allocation.asset[0] : allocation.asset
    if (asset?.provider === 'PC' || asset?.provider === 'Sobeys') allocated[asset.provider] += 1
  }

  const neededPairs: Record<GiftCardProvider, Set<string>> = { PC: new Set(), Sobeys: new Set() }
  for (const attendance of attendanceRows) {
    if (!attendance.profile_id || attendance.state !== 'active' || attendance.gift_card_blocked) continue
    if (attendance.camera_on !== true && attendance.photo_status !== 'accepted') continue
    const key = allocationKey(attendance.class_id, attendance.profile_id)
    if (allocatedPairs.has(key)) continue
    const provider = providerByProfileId.get(attendance.profile_id)
    if (provider) neededPairs[provider].add(key)
  }

  return {
    ...range,
    acceptedFamilies,
    allocated,
    stillNeeded: { PC: neededPairs.PC.size, Sobeys: neededPairs.Sobeys.size },
  }
}

export const loadGiftCardAllocationForecastSnapshot = async (): Promise<GiftCardAllocationForecastSnapshot> => {
  const ranges = buildGiftCardWeekRanges()
  const [available, ...weeks] = await Promise.all([loadAvailableCounts(), ...ranges.map(buildWeekSnapshot)])
  return {
    generatedAt: new Date().toISOString(),
    timezone: TORONTO_TIME_ZONE,
    available,
    weeks: weeks as [GiftCardWeekSnapshot, GiftCardWeekSnapshot, GiftCardWeekSnapshot],
  }
}
