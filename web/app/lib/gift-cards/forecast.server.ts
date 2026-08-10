import { adminClient } from '@/lib/supabase/adminClient'

const TORONTO_TIME_ZONE = 'America/Toronto'
const QUERY_BATCH_SIZE = 100

export type GiftCardProvider = 'PC' | 'Sobeys'

type ClassScopeRow = { id: string; workshop_id: string | null; starts_at: string }
type EnrollmentRow = { workshop_id: string | null; profile_id: string | null }
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
type FamilyEdgeRow = { guardian_profile_id: string; child_profile_id: string }
type ProfileRow = { id: string; user_id: string | null }
type FormSubmissionRow = { id: string; profile_id: string | null; user_id: string | null; submitted_at: string | null }
type FormAnswerRow = { submission_id: string; value: unknown }

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

const unique = <T,>(items: T[]) => Array.from(new Set(items))
const emptyProviderCounts = (): Record<GiftCardProvider, number> => ({ PC: 0, Sobeys: 0 })
const allocationKey = (classId: string, profileId: string) => `${classId}::${profileId}`

const chunkArray = <T,>(items: T[]) => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += QUERY_BATCH_SIZE) chunks.push(items.slice(index, index + QUERY_BATCH_SIZE))
  return chunks
}

const torontoPartsForDate = (date: Date) => {
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
    const local = torontoPartsForDate(candidate)
    if (local.year === year && local.month === month && local.day === day) return candidate.toISOString()
  }
  throw new Error(`Unable to resolve Toronto midnight for ${year}-${month}-${day}`)
}

export const buildGiftCardWeekRanges = (now = new Date()): [GiftCardWeekRange, GiftCardWeekRange, GiftCardWeekRange] => {
  const local = torontoPartsForDate(now)
  const thisSunday = addDays(local.year, local.month, local.day, -weekdayIndexByLabel[local.weekday])
  return [0, 7, 14].map(days => {
    const start = addDays(thisSunday.year, thisSunday.month, thisSunday.day, days)
    const end = addDays(start.year, start.month, start.day, 7)
    return { startsAt: torontoMidnightIso(start.year, start.month, start.day), endsAt: torontoMidnightIso(end.year, end.month, end.day) }
  }) as [GiftCardWeekRange, GiftCardWeekRange, GiftCardWeekRange]
}

const providerFromDisplay = (value: string | null | undefined): GiftCardProvider | null => {
  const normalized = (value ?? '').trim().toLowerCase()
  const compact = normalized.replace(/[^a-z0-9]+/g, '')
  if (compact.includes('mealkit') || normalized.includes('meal kit')) return null
  return compact.includes('sobeys') || normalized.includes('sobeys') || normalized.includes("sobey's") ? 'Sobeys' : 'PC'
}

const loadClasses = async (range: GiftCardWeekRange) => {
  const { data, error } = await adminClient
    .from('class')
    .select('id, workshop_id, starts_at')
    .gte('starts_at', range.startsAt)
    .lt('starts_at', range.endsAt)
  if (error) throw new Error(`Failed to load gift-card classes: ${error.message}`)
  return (data ?? []) as ClassScopeRow[]
}

const loadEnrollments = async (workshopIds: string[]) => {
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

const loadAttendance = async (classIds: string[]) => {
  const rows: AttendanceRow[] = []
  for (const chunk of chunkArray(classIds)) {
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
  for (const chunk of chunkArray(classIds)) {
    const { data, error } = await adminClient
      .from('gift_card_allocation')
      .select('class_id, profile_id, asset:gift_card_asset_id(provider)')
      .in('class_id', chunk)
    if (error) throw new Error(`Failed to load gift-card allocations: ${error.message}`)
    rows.push(...((data ?? []) as AllocationRow[]))
  }
  return rows
}

const loadProviderByProfileId = async (profileIds: string[]) => {
  const normalizedProfileIds = unique(profileIds.filter(Boolean))
  const providerByProfileId = new Map<string, GiftCardProvider | null>()
  if (!normalizedProfileIds.length) return providerByProfileId

  const profiles: ProfileRow[] = []
  for (const chunk of chunkArray(normalizedProfileIds)) {
    const { data, error } = await adminClient.from('profile').select('id, user_id').in('id', chunk)
    if (error) throw new Error(`Failed to load gift-card profiles: ${error.message}`)
    profiles.push(...((data ?? []) as ProfileRow[]))
  }

  const profilesByUserId = new Map<string, string[]>()
  for (const profile of profiles) {
    if (!profile.user_id) continue
    const ids = profilesByUserId.get(profile.user_id) ?? []
    ids.push(profile.id)
    profilesByUserId.set(profile.user_id, ids)
  }

  const submissionsById = new Map<string, FormSubmissionRow>()
  const loadSubmissions = async (column: 'profile_id' | 'user_id', ids: string[]) => {
    for (const chunk of chunkArray(ids)) {
      const { data, error } = await adminClient.from('form_submission').select('id, profile_id, user_id, submitted_at').in(column, chunk)
      if (error) throw new Error(`Failed to load gift-card form submissions: ${error.message}`)
      for (const row of (data ?? []) as FormSubmissionRow[]) submissionsById.set(row.id, row)
    }
  }
  await loadSubmissions('profile_id', normalizedProfileIds)
  await loadSubmissions('user_id', Array.from(profilesByUserId.keys()))

  const latestValueByProfileId = new Map<string, { value: string; submittedAt: number }>()
  for (const chunk of chunkArray(Array.from(submissionsById.keys()))) {
    const { data, error } = await adminClient
      .from('form_answer')
      .select('submission_id, value')
      .eq('question_code', 'gift_card_store_preference')
      .in('submission_id', chunk)
    if (error) throw new Error(`Failed to load gift-card preference answers: ${error.message}`)
    for (const answer of (data ?? []) as FormAnswerRow[]) {
      const submission = submissionsById.get(answer.submission_id)
      const value = typeof answer.value === 'string' ? answer.value.trim() : ''
      if (!submission || !value) continue
      const associated = new Set<string>()
      if (submission.profile_id && normalizedProfileIds.includes(submission.profile_id)) associated.add(submission.profile_id)
      if (submission.user_id) for (const id of profilesByUserId.get(submission.user_id) ?? []) associated.add(id)
      const submittedAt = Date.parse(submission.submitted_at ?? '') || 0
      for (const profileId of associated) {
        const prior = latestValueByProfileId.get(profileId)
        if (!prior || submittedAt > prior.submittedAt) latestValueByProfileId.set(profileId, { value, submittedAt })
      }
    }
  }

  for (const profileId of normalizedProfileIds) {
    providerByProfileId.set(profileId, providerFromDisplay(latestValueByProfileId.get(profileId)?.value))
  }
  return providerByProfileId
}

const loadFamilyIdByProfileId = async (profileIds: string[]) => {
  const seen = new Set(profileIds)
  const queue = [...seen]
  const edges: FamilyEdgeRow[] = []
  while (queue.length) {
    const batch = queue.splice(0, QUERY_BATCH_SIZE)
    const [guardians, children] = await Promise.all([
      adminClient.from('person_guardian_child').select('guardian_profile_id, child_profile_id').in('guardian_profile_id', batch),
      adminClient.from('person_guardian_child').select('guardian_profile_id, child_profile_id').in('child_profile_id', batch),
    ])
    if (guardians.error) throw new Error(`Failed to load family guardians: ${guardians.error.message}`)
    if (children.error) throw new Error(`Failed to load family children: ${children.error.message}`)
    for (const edge of [...(guardians.data ?? []), ...(children.data ?? [])] as FamilyEdgeRow[]) {
      edges.push(edge)
      for (const id of [edge.guardian_profile_id, edge.child_profile_id]) if (!seen.has(id)) {
        seen.add(id)
        queue.push(id)
      }
    }
  }
  const adjacent = new Map<string, Set<string>>()
  for (const id of seen) adjacent.set(id, new Set())
  for (const edge of edges) {
    adjacent.get(edge.guardian_profile_id)?.add(edge.child_profile_id)
    adjacent.get(edge.child_profile_id)?.add(edge.guardian_profile_id)
  }
  const familyByProfileId = new Map<string, string>()
  for (const id of seen) {
    if (familyByProfileId.has(id)) continue
    const stack = [id]
    const members: string[] = []
    while (stack.length) {
      const current = stack.pop() as string
      if (familyByProfileId.has(current)) continue
      familyByProfileId.set(current, id)
      members.push(current)
      for (const next of adjacent.get(current) ?? []) stack.push(next)
    }
    const familyId = members.sort((left, right) => left.localeCompare(right))[0]
    for (const member of members) familyByProfileId.set(member, familyId)
  }
  return familyByProfileId
}

const loadAssetCounts = async (status: 'available' | 'used') => {
  const counts = emptyProviderCounts()
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
  const fullRange = { startsAt: weeks[0].startsAt, endsAt: weeks[2].endsAt }
  const classes = await loadClasses(fullRange)
  const classIds = classes.map(row => row.id)
  const workshopIds = unique(classes.map(row => row.workshop_id).filter((id): id is string => Boolean(id)))
  const [enrollments, attendanceRows, allocations, available, used] = await Promise.all([
    loadEnrollments(workshopIds),
    loadAttendance(classIds),
    loadAllocations(classIds),
    loadAssetCounts('available'),
    loadAssetCounts('used'),
  ])

  const approvedProfileIds = unique(enrollments.map(row => row.profile_id).filter((id): id is string => Boolean(id)))
  const attendanceProfileIds = attendanceRows.map(row => row.profile_id).filter((id): id is string => Boolean(id))
  const [providerByProfileId, familyByProfileId] = await Promise.all([
    loadProviderByProfileId([...approvedProfileIds, ...attendanceProfileIds]),
    loadFamilyIdByProfileId(approvedProfileIds),
  ])

  const acceptedFamilies = emptyProviderCounts()
  for (const provider of providers) {
    const familyIds = new Set<string>()
    for (const profileId of approvedProfileIds) {
      if (providerByProfileId.get(profileId) === provider) familyIds.add(familyByProfileId.get(profileId) ?? profileId)
    }
    acceptedFamilies[provider] = familyIds.size
  }

  const snapshots = weeks.map(range => {
    const classIdSet = new Set(
      classes
        .filter(row => row.starts_at >= range.startsAt && row.starts_at < range.endsAt)
        .map(row => row.id)
    )
    const allocated = emptyProviderCounts()
    const allocatedPairs = new Set<string>()
    for (const allocation of allocations) {
      if (!allocation.profile_id || !classIdSet.has(allocation.class_id)) continue
      allocatedPairs.add(allocationKey(allocation.class_id, allocation.profile_id))
      const asset = Array.isArray(allocation.asset) ? allocation.asset[0] : allocation.asset
      if (asset?.provider === 'PC' || asset?.provider === 'Sobeys') allocated[asset.provider] += 1
    }
    const stillNeeded: Record<GiftCardProvider, Set<string>> = { PC: new Set(), Sobeys: new Set() }
    for (const attendance of attendanceRows) {
      if (!attendance.profile_id || !classIdSet.has(attendance.class_id)) continue
      if (attendance.state !== 'active' || attendance.gift_card_blocked) continue
      if (attendance.camera_on !== true && attendance.photo_status !== 'accepted') continue
      const key = allocationKey(attendance.class_id, attendance.profile_id)
      if (allocatedPairs.has(key)) continue
      const provider = providerByProfileId.get(attendance.profile_id)
      if (provider) stillNeeded[provider].add(key)
    }
    return { ...range, allocated, stillNeeded: { PC: stillNeeded.PC.size, Sobeys: stillNeeded.Sobeys.size } }
  }) as [GiftCardWeekSnapshot, GiftCardWeekSnapshot, GiftCardWeekSnapshot]

  return { generatedAt: new Date().toISOString(), timezone: TORONTO_TIME_ZONE, available, acceptedFamilies, used, weeks: snapshots }
}
