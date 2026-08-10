import { resolveGiftCardFulfillmentByProfileId, type GiftCardProvider } from '@/lib/gift-cards/provider.server'
import { adminClient } from '@/lib/supabase/adminClient'

const TORONTO_TIME_ZONE = 'America/Toronto'
const BATCH_SIZE = 100

type ClassRow = { id: string; workshop_id: string | null; starts_at: string }
type EnrollmentRow = { workshop_id: string | null; profile_id: string | null }
type AllocationRow = {
  class_id: string
  profile_id: string | null
  asset: { provider: GiftCardProvider } | Array<{ provider: GiftCardProvider }> | null
}
type AttendanceRow = { class_id: string; profile_id: string | null; gift_card_blocked: boolean | null }

export type { GiftCardProvider }
export type GiftCardWeekRange = { startsAt: string; endsAt: string }
export type GiftCardWeekSnapshot = GiftCardWeekRange & {
  allocated: Record<GiftCardProvider, number>
  stillNeeded: Record<GiftCardProvider, number>
}
export type GiftCardAllocationForecastSnapshot = {
  generatedAt: string
  timezone: typeof TORONTO_TIME_ZONE
  available: Record<GiftCardProvider, number>
  acceptedFamilies: Record<GiftCardProvider, number>
  used: Record<GiftCardProvider, number>
  weeks: [GiftCardWeekSnapshot, GiftCardWeekSnapshot, GiftCardWeekSnapshot]
}

const providers: GiftCardProvider[] = ['PC', 'Sobeys']
const weekdayIndexByLabel: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const torontoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TORONTO_TIME_ZONE,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const emptyCounts = (): Record<GiftCardProvider, number> => ({ PC: 0, Sobeys: 0 })
const unique = <T,>(values: T[]) => Array.from(new Set(values))
const allocationKey = (classId: string, profileId: string) => `${classId}::${profileId}`
const chunkArray = <T,>(items: T[]) => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += BATCH_SIZE) chunks.push(items.slice(index, index + BATCH_SIZE))
  return chunks
}

const torontoParts = (date: Date) => {
  const parts = torontoDateFormatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return { weekday: get('weekday'), year: Number(get('year')), month: Number(get('month')), day: Number(get('day')) }
}

const addDays = (year: number, month: number, day: number, days: number) => {
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

const torontoMidnightIso = (year: number, month: number, day: number) => {
  for (let hour = 0; hour < 24; hour += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour))
    const local = torontoParts(candidate)
    if (local.year === year && local.month === month && local.day === day) return candidate.toISOString()
  }
  throw new Error(`Unable to resolve Toronto midnight for ${year}-${month}-${day}`)
}

export const buildGiftCardWeekRanges = (now = new Date()): [GiftCardWeekRange, GiftCardWeekRange, GiftCardWeekRange] => {
  const local = torontoParts(now)
  const sunday = addDays(local.year, local.month, local.day, -weekdayIndexByLabel[local.weekday])
  return [0, 7, 14].map(offset => {
    const start = addDays(sunday.year, sunday.month, sunday.day, offset)
    const end = addDays(start.year, start.month, start.day, 7)
    return { startsAt: torontoMidnightIso(start.year, start.month, start.day), endsAt: torontoMidnightIso(end.year, end.month, end.day) }
  }) as [GiftCardWeekRange, GiftCardWeekRange, GiftCardWeekRange]
}

const loadClasses = async (range: GiftCardWeekRange) => {
  const { data, error } = await adminClient
    .from('class')
    .select('id, workshop_id, starts_at')
    .gte('starts_at', range.startsAt)
    .lt('starts_at', range.endsAt)
  if (error) throw new Error(`Failed to load gift-card classes: ${error.message}`)
  return (data ?? []) as ClassRow[]
}

const loadRowsByClass = async <T>(table: 'class_attendance' | 'gift_card_allocation', select: string, classIds: string[]) => {
  const rows: T[] = []
  for (const chunk of chunkArray(classIds)) {
    const { data, error } = await adminClient.from(table).select(select).in('class_id', chunk)
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`)
    rows.push(...((data ?? []) as T[]))
  }
  return rows
}

const loadApprovedEnrollments = async (workshopIds: string[]) => {
  const rows: EnrollmentRow[] = []
  for (const chunk of chunkArray(workshopIds)) {
    const { data, error } = await adminClient
      .from('workshop_enrollment')
      .select('workshop_id, profile_id')
      .in('workshop_id', chunk)
      .eq('status', 'approved')
    if (error) throw new Error(`Failed to load approved enrollments: ${error.message}`)
    rows.push(...((data ?? []) as EnrollmentRow[]))
  }
  return rows
}

const loadAssetCounts = async (status: 'available' | 'used') => {
  const counts = emptyCounts()
  await Promise.all(providers.map(async provider => {
    const { count, error } = await adminClient
      .from('gift_card_asset')
      .select('id', { count: 'exact', head: true })
      .eq('provider', provider)
      .eq('status', status)
    if (error) throw new Error(`Failed to count ${status} ${provider} cards: ${error.message}`)
    counts[provider] = count ?? 0
  }))
  return counts
}

export const loadGiftCardAllocationForecastSnapshot = async (): Promise<GiftCardAllocationForecastSnapshot> => {
  const weeks = buildGiftCardWeekRanges()
  const classes = await loadClasses({ startsAt: weeks[0].startsAt, endsAt: weeks[2].endsAt })
  const classIds = classes.map(row => row.id)
  const workshopIds = unique(classes.map(row => row.workshop_id).filter((id): id is string => Boolean(id)))
  const [enrollments, attendanceRows, allocations, available, used] = await Promise.all([
    loadApprovedEnrollments(workshopIds),
    loadRowsByClass<AttendanceRow>('class_attendance', 'class_id, profile_id, gift_card_blocked', classIds),
    loadRowsByClass<AllocationRow>('gift_card_allocation', 'class_id, profile_id, asset:gift_card_asset_id(provider)', classIds),
    loadAssetCounts('available'),
    loadAssetCounts('used'),
  ])
  const approvedProfileIds = unique(enrollments.map(row => row.profile_id).filter((id): id is string => Boolean(id)))
  const { fulfillmentByProfileId, familyIdByProfileId } = await resolveGiftCardFulfillmentByProfileId(approvedProfileIds)
  const profilesByWorkshop = new Map<string, string[]>()
  for (const enrollment of enrollments) {
    if (!enrollment.workshop_id || !enrollment.profile_id) continue
    const profileIds = profilesByWorkshop.get(enrollment.workshop_id) ?? []
    if (!profileIds.includes(enrollment.profile_id)) profileIds.push(enrollment.profile_id)
    profilesByWorkshop.set(enrollment.workshop_id, profileIds)
  }

  const acceptedFamilies = emptyCounts()
  for (const provider of providers) {
    const familyIds = new Set<string>()
    for (const profileId of approvedProfileIds) {
      if (fulfillmentByProfileId.get(profileId) === provider) familyIds.add(familyIdByProfileId.get(profileId) ?? profileId)
    }
    acceptedFamilies[provider] = familyIds.size
  }

  const attendanceByPair = new Map<string, AttendanceRow>()
  for (const attendance of attendanceRows) if (attendance.profile_id) attendanceByPair.set(allocationKey(attendance.class_id, attendance.profile_id), attendance)
  const allocationByPair = new Map<string, AllocationRow>()
  for (const allocation of allocations) if (allocation.profile_id) allocationByPair.set(allocationKey(allocation.class_id, allocation.profile_id), allocation)

  const snapshots = weeks.map(range => {
    const allocated = emptyCounts()
    const stillNeeded = emptyCounts()
    for (const classRow of classes) {
      if (classRow.starts_at < range.startsAt || classRow.starts_at >= range.endsAt || !classRow.workshop_id) continue
      for (const profileId of profilesByWorkshop.get(classRow.workshop_id) ?? []) {
        const fulfillment = fulfillmentByProfileId.get(profileId)
        if (fulfillment === 'meal_kit') continue
        const provider = fulfillment === 'Sobeys' ? 'Sobeys' : 'PC'
        const key = allocationKey(classRow.id, profileId)
        if (allocationByPair.has(key)) {
          allocated[provider] += 1
          continue
        }
        if (attendanceByPair.get(key)?.gift_card_blocked) continue
        stillNeeded[provider] += 1
      }
    }
    return { ...range, allocated, stillNeeded }
  }) as [GiftCardWeekSnapshot, GiftCardWeekSnapshot, GiftCardWeekSnapshot]

  return { generatedAt: new Date().toISOString(), timezone: TORONTO_TIME_ZONE, available, acceptedFamilies, used, weeks: snapshots }
}
