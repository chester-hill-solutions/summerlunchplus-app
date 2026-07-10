import type { Database } from '@/lib/database.types'
import { requireAuth } from '@/lib/auth.server'
import { createClient } from '@/lib/supabase/server'
import { isRoleAtLeast } from '@/lib/roles'

type FamilyEdgeRow = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
}

type ProfileRidingRow = {
  id: string
  user_id: string | null
  role: Database['public']['Enums']['app_role'] | null
  federal_electoral_district_name: string | null
  household_children_count: number | null
}

type FormSubmissionRow = {
  id: string
  profile_id: string | null
  user_id: string | null
  submitted_at: string | null
}

type FormAnswerRow = {
  submission_id: string
  question_code: string
  value: unknown
}

type GiftCardBucket = 'pc' | 'sobeys' | 'other'

const PROFILE_IN_BATCH_SIZE = 80
const FAMILY_EDGE_IN_BATCH_SIZE = 40
const RELATED_PROFILE_IN_BATCH_SIZE = 80
const GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE = 'gift_card_store_preference'

const statusBucketFor = (status: Database['public']['Enums']['workshop_enrollment_status']) => {
  if (status === 'approved') return 'accepted'
  if (status === 'pending') return 'pending'
  if (status === 'waitlisted') return 'waitlisted'
  if (status === 'rejected' || status === 'revoked') return 'declined'
  return null
}

const canonicalRiding = (value: string) =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/[—–−]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()

const normalizeGiftCardBucket = (value: unknown): GiftCardBucket | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (
    normalized.includes('president') ||
    normalized.includes('pc') ||
    normalized.includes('loblaw') ||
    normalized.includes('superstore') ||
    normalized.includes('no frills') ||
    normalized.includes('fortinos') ||
    normalized.includes('t&t')
  ) {
    return 'pc'
  }
  if (
    normalized.includes('sobeys') ||
    normalized.includes('freshco') ||
    normalized.includes('safeway') ||
    normalized.includes('foodland') ||
    normalized.includes('iga') ||
    normalized.includes('thrifty')
  ) {
    return 'sobeys'
  }
  return 'other'
}

const chunk = <T,>(items: T[], size: number) => {
  if (!items.length || size <= 0) return [] as T[][]
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

const pushFamilyLink = (
  map: Map<string, Array<{ profileId: string; primary: boolean }>>,
  key: string,
  profileId: string,
  primary: boolean
) => {
  const entries = map.get(key) ?? []
  if (entries.some(entry => entry.profileId === profileId)) return
  entries.push({ profileId, primary })
  entries.sort((left, right) => Number(right.primary) - Number(left.primary) || left.profileId.localeCompare(right.profileId))
  map.set(key, entries)
}

const firstRidingFromLinks = (
  links: Array<{ profileId: string; primary: boolean }> | undefined,
  ridingByProfileId: Map<string, string>
) => {
  if (!links?.length) return null
  for (const link of links) {
    const riding = ridingByProfileId.get(link.profileId)
    if (riding) return riding
  }
  return null
}

export async function loader({ request }: { request: Request }) {
  const auth = await requireAuth(request)
  const { supabase } = createClient(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const url = new URL(request.url)
  const ridingNames = Array.from(
    new Set(
      url.searchParams
        .getAll('riding')
        .map(value => value.trim())
        .filter(Boolean)
    )
  )

  if (!ridingNames.length) {
    return Response.json({ byRiding: {} }, { headers: auth.headers })
  }

  const byRiding = ridingNames.reduce<Record<string, {
    total: number
    accepted: number
    pending: number
    waitlisted: number
    declined: number
    giftcard_pc: number
    giftcard_sobeys: number
    giftcard_meal_kit: number
    household_count: number
    household_child_count: number
  }>>(
    (acc, riding) => {
      acc[riding] = {
        total: 0,
        accepted: 0,
        pending: 0,
        waitlisted: 0,
        declined: 0,
        giftcard_pc: 0,
        giftcard_sobeys: 0,
        giftcard_meal_kit: 0,
        household_count: 0,
        household_child_count: 0,
      }
      return acc
    },
    {}
  )

  const requestedRidingByCanonical = new Map(
    ridingNames.map(riding => [canonicalRiding(riding), riding])
  )

  const { data: requestedDistrictRows, error: districtError } = await supabase
    .from('federal_electoral_district')
    .select('name, meal_kit')
    .in('name', ridingNames)

  if (districtError) {
    console.error('[federal-electoral-district] failed to load requested district rows', districtError)
    return Response.json({ byRiding }, { headers: auth.headers })
  }

  const mealKitByRequestedRiding = new Map(
    (requestedDistrictRows ?? [])
      .map(row => [row.name, row.meal_kit === true] as const)
      .filter((entry): entry is [string, boolean] => typeof entry[0] === 'string')
  )

  const { data: enrollmentRows, error: enrollmentError } = await supabase
    .from('workshop_enrollment')
    .select('profile_id, status')
    .not('profile_id', 'is', null)

  if (enrollmentError) {
    console.error('[federal-electoral-district] failed to load enrollment rows', enrollmentError)
    return Response.json({ byRiding }, { headers: auth.headers })
  }

  const profileIds = Array.from(
    new Set(
      (enrollmentRows ?? [])
        .map(enrollment => enrollment.profile_id)
        .filter((profileId): profileId is string => typeof profileId === 'string' && Boolean(profileId))
    )
  )

  if (!profileIds.length) {
    return Response.json({ byRiding }, { headers: auth.headers })
  }

  const profileRows: ProfileRidingRow[] = []
  for (const profileChunk of chunk(profileIds, PROFILE_IN_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('profile')
      .select('id, user_id, role, federal_electoral_district_name, household_children_count')
      .in('id', profileChunk)

    if (error) {
      console.error('[federal-electoral-district] failed to load profile riding map', error)
      return Response.json({ byRiding }, { headers: auth.headers })
    }

    profileRows.push(...((data ?? []) as ProfileRidingRow[]))
  }

  const profileById = new Map(profileRows.map(row => [row.id, row]))
  const profileIdsByUserId = new Map<string, string[]>()
  for (const row of profileRows) {
    const userId = typeof row.user_id === 'string' ? row.user_id : ''
    if (!userId) continue
    const existing = profileIdsByUserId.get(userId) ?? []
    if (!existing.includes(row.id)) {
      existing.push(row.id)
      profileIdsByUserId.set(userId, existing)
    }
  }
  const ridingByProfileId = new Map(
    profileRows
      .map(row => [row.id, typeof row.federal_electoral_district_name === 'string' ? row.federal_electoral_district_name.trim() : ''] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  )

  const childrenByGuardian = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const guardiansByChild = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const familyEdgeKeys = new Set<string>()

  for (const profileChunk of chunk(profileIds, FAMILY_EDGE_IN_BATCH_SIZE)) {
    const [{ data: guardianEdges, error: guardianEdgesError }, { data: childEdges, error: childEdgesError }] =
      await Promise.all([
        supabase
          .from('person_guardian_child')
          .select('guardian_profile_id, child_profile_id, primary_child')
          .in('guardian_profile_id', profileChunk),
        supabase
          .from('person_guardian_child')
          .select('guardian_profile_id, child_profile_id, primary_child')
          .in('child_profile_id', profileChunk),
      ])

    if (guardianEdgesError) {
      console.error('[federal-electoral-district] failed to load guardian family edges', {
        chunkSize: profileChunk.length,
        error: guardianEdgesError.message,
      })
      return Response.json({ byRiding }, { headers: auth.headers })
    }
    if (childEdgesError) {
      console.error('[federal-electoral-district] failed to load child family edges', {
        chunkSize: profileChunk.length,
        error: childEdgesError.message,
      })
      return Response.json({ byRiding }, { headers: auth.headers })
    }

    for (const edge of [...(guardianEdges ?? []), ...(childEdges ?? [])] as FamilyEdgeRow[]) {
      const edgeKey = `${edge.guardian_profile_id}:${edge.child_profile_id}`
      if (familyEdgeKeys.has(edgeKey)) continue
      familyEdgeKeys.add(edgeKey)
      pushFamilyLink(childrenByGuardian, edge.guardian_profile_id, edge.child_profile_id, edge.primary_child)
      pushFamilyLink(guardiansByChild, edge.child_profile_id, edge.guardian_profile_id, edge.primary_child)
    }
  }

  const missingRelatedProfileIds = Array.from(
    new Set(
      Array.from(familyEdgeKeys).flatMap(edgeKey => edgeKey.split(':')).filter(profileId => !profileById.has(profileId))
    )
  )

  for (const relatedChunk of chunk(missingRelatedProfileIds, RELATED_PROFILE_IN_BATCH_SIZE)) {
    const { data: relatedProfiles, error: relatedProfilesError } = await supabase
      .from('profile')
      .select('id, user_id, role, federal_electoral_district_name, household_children_count')
      .in('id', relatedChunk)

    if (relatedProfilesError) {
      console.error('[federal-electoral-district] failed to load related profile ridings', relatedProfilesError)
      return Response.json({ byRiding }, { headers: auth.headers })
    }

    for (const related of relatedProfiles ?? []) {
      const relatedId = typeof related.id === 'string' ? related.id : ''
      const relatedRiding =
        typeof related.federal_electoral_district_name === 'string'
          ? related.federal_electoral_district_name.trim()
          : ''
      if (!relatedId || !relatedRiding) continue
      ridingByProfileId.set(relatedId, relatedRiding)
      if (!profileById.has(relatedId)) {
        profileById.set(relatedId, {
          id: relatedId,
          user_id: typeof related.user_id === 'string' ? related.user_id : null,
          role: (related.role ?? null) as Database['public']['Enums']['app_role'] | null,
          federal_electoral_district_name: relatedRiding,
          household_children_count:
            typeof related.household_children_count === 'number' ? related.household_children_count : null,
        })
      }
      if (typeof related.user_id === 'string' && related.user_id) {
        const existing = profileIdsByUserId.get(related.user_id) ?? []
        if (!existing.includes(relatedId)) {
          existing.push(relatedId)
          profileIdsByUserId.set(related.user_id, existing)
        }
      }
    }
  }

  const familyAdjacency = new Map<string, Set<string>>()
  for (const profileId of profileById.keys()) {
    familyAdjacency.set(profileId, new Set())
  }
  for (const edgeKey of familyEdgeKeys) {
    const [guardianId, childId] = edgeKey.split(':')
    if (!guardianId || !childId) continue
    if (!familyAdjacency.has(guardianId)) {
      familyAdjacency.set(guardianId, new Set())
    }
    if (!familyAdjacency.has(childId)) {
      familyAdjacency.set(childId, new Set())
    }
    familyAdjacency.get(guardianId)?.add(childId)
    familyAdjacency.get(childId)?.add(guardianId)
  }

  const householdKeyByProfileId = new Map<string, string>()
  const householdMembersByKey = new Map<string, string[]>()
  const householdChildCountByKey = new Map<string, number>()
  const visitedProfiles = new Set<string>()

  for (const startProfileId of familyAdjacency.keys()) {
    if (visitedProfiles.has(startProfileId)) continue
    const queue = [startProfileId]
    const members: string[] = []
    visitedProfiles.add(startProfileId)

    while (queue.length) {
      const current = queue.shift()
      if (!current) continue
      members.push(current)
      for (const neighbor of familyAdjacency.get(current) ?? []) {
        if (visitedProfiles.has(neighbor)) continue
        visitedProfiles.add(neighbor)
        queue.push(neighbor)
      }
    }

    members.sort((left, right) => left.localeCompare(right))
    const householdKey = members[0] ?? startProfileId
    householdMembersByKey.set(householdKey, members)
    for (const memberId of members) {
      householdKeyByProfileId.set(memberId, householdKey)
    }

    const inferredChildrenCount = members.reduce((count, memberId) => {
      const profile = profileById.get(memberId)
      const isStudent = profile?.role === 'student'
      const isChildRoleByLink = guardiansByChild.has(memberId)
      return count + (isStudent || isChildRoleByLink ? 1 : 0)
    }, 0)

    if (inferredChildrenCount > 0) {
      householdChildCountByKey.set(householdKey, inferredChildrenCount)
      continue
    }

    const fallbackChildrenCount = members.reduce((maxValue, memberId) => {
      const value = Number(profileById.get(memberId)?.household_children_count ?? 0)
      return Number.isFinite(value) ? Math.max(maxValue, value) : maxValue
    }, 0)
    householdChildCountByKey.set(householdKey, fallbackChildrenCount)
  }

  const submissionRowsById = new Map<string, FormSubmissionRow>()
  for (const profileChunk of chunk(Array.from(profileById.keys()), PROFILE_IN_BATCH_SIZE)) {
    const { data: submissions, error } = await supabase
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('profile_id', profileChunk)

    if (error) {
      console.error('[federal-electoral-district] failed to load form submissions by profile', error)
      continue
    }

    for (const row of (submissions ?? []) as FormSubmissionRow[]) {
      submissionRowsById.set(row.id, row)
    }
  }

  for (const userChunk of chunk(Array.from(profileIdsByUserId.keys()), PROFILE_IN_BATCH_SIZE)) {
    const { data: submissions, error } = await supabase
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('user_id', userChunk)

    if (error) {
      console.error('[federal-electoral-district] failed to load form submissions by user', error)
      continue
    }

    for (const row of (submissions ?? []) as FormSubmissionRow[]) {
      submissionRowsById.set(row.id, row)
    }
  }

  const latestGiftCardByProfileId = new Map<string, { bucket: GiftCardBucket; submittedAt: number }>()
  const submissionIds = Array.from(submissionRowsById.keys())
  for (const submissionChunk of chunk(submissionIds, PROFILE_IN_BATCH_SIZE)) {
    const { data: answers, error } = await supabase
      .from('form_answer')
      .select('submission_id, question_code, value')
      .eq('question_code', GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE)
      .in('submission_id', submissionChunk)

    if (error) {
      console.error('[federal-electoral-district] failed to load gift card answers', error)
      continue
    }

    for (const answer of (answers ?? []) as FormAnswerRow[]) {
      const bucket = normalizeGiftCardBucket(answer.value)
      if (!bucket) continue
      const submission = submissionRowsById.get(answer.submission_id)
      if (!submission) continue

      const submittedAt = Date.parse(submission.submitted_at ?? '')
      const submittedAtTime = Number.isNaN(submittedAt) ? 0 : submittedAt
      const associatedProfileIds = new Set<string>()
      if (typeof submission.profile_id === 'string' && submission.profile_id) {
        associatedProfileIds.add(submission.profile_id)
      }
      if (typeof submission.user_id === 'string' && submission.user_id) {
        for (const profileId of profileIdsByUserId.get(submission.user_id) ?? []) {
          associatedProfileIds.add(profileId)
        }
      }

      for (const profileId of associatedProfileIds) {
        const existing = latestGiftCardByProfileId.get(profileId)
        if (!existing || submittedAtTime > existing.submittedAt) {
          latestGiftCardByProfileId.set(profileId, { bucket, submittedAt: submittedAtTime })
        }
      }
    }
  }

  const seenHouseholdsByRiding = new Map<string, Set<string>>()

  for (const enrollment of enrollmentRows ?? []) {
    const profileId = typeof enrollment.profile_id === 'string' ? enrollment.profile_id : ''
    if (!profileId) continue

    const enrolledProfile = profileById.get(profileId)
    const enrolledRole = enrolledProfile?.role

    const enrolledRiding = ridingByProfileId.get(profileId) ?? null
    const primaryChildRiding = firstRidingFromLinks(childrenByGuardian.get(profileId), ridingByProfileId)
    const primaryGuardianRiding = firstRidingFromLinks(guardiansByChild.get(profileId), ridingByProfileId)
    const anyFamilyRiding =
      firstRidingFromLinks(childrenByGuardian.get(profileId), ridingByProfileId) ??
      firstRidingFromLinks(guardiansByChild.get(profileId), ridingByProfileId)

    const effectiveRiding =
      enrolledRiding ??
      (enrolledRole === 'guardian' ? primaryChildRiding : null) ??
      (enrolledRole === 'student' ? primaryGuardianRiding : null) ??
      primaryChildRiding ??
      primaryGuardianRiding ??
      anyFamilyRiding

    if (!effectiveRiding) continue

    const requestedRiding = requestedRidingByCanonical.get(canonicalRiding(effectiveRiding))
    if (!requestedRiding) continue

    const status = enrollment.status as Database['public']['Enums']['workshop_enrollment_status']
    const bucket = statusBucketFor(status)
    if (!bucket) continue

    byRiding[requestedRiding].total += 1
    byRiding[requestedRiding][bucket] += 1

    const householdId = householdKeyByProfileId.get(profileId) ?? profileId

    const seenHouseholds = seenHouseholdsByRiding.get(requestedRiding) ?? new Set<string>()
    if (seenHouseholds.has(householdId)) continue
    seenHouseholds.add(householdId)
    seenHouseholdsByRiding.set(requestedRiding, seenHouseholds)

    byRiding[requestedRiding].household_count += 1

    const householdChildren = Number(householdChildCountByKey.get(householdId) ?? 0)
    if (Number.isFinite(householdChildren) && householdChildren > 0) {
      byRiding[requestedRiding].household_child_count += householdChildren
    }

    if (mealKitByRequestedRiding.get(requestedRiding) === true) {
      byRiding[requestedRiding].giftcard_meal_kit += 1
      continue
    }

    const giftCardCandidates = new Set<string>(householdMembersByKey.get(householdId) ?? [profileId])
    giftCardCandidates.add(profileId)

    let resolvedGiftCardBucket: GiftCardBucket | null = null
    let resolvedGiftCardSubmittedAt = -1
    for (const candidateProfileId of giftCardCandidates) {
      const giftCard = latestGiftCardByProfileId.get(candidateProfileId)
      if (!giftCard) continue
      if (giftCard.submittedAt > resolvedGiftCardSubmittedAt) {
        resolvedGiftCardBucket = giftCard.bucket
        resolvedGiftCardSubmittedAt = giftCard.submittedAt
      }
    }

    if (resolvedGiftCardBucket === 'pc') {
      byRiding[requestedRiding].giftcard_pc += 1
    } else if (resolvedGiftCardBucket === 'sobeys') {
      byRiding[requestedRiding].giftcard_sobeys += 1
    }
  }

  return Response.json({ byRiding }, { headers: auth.headers })
}
