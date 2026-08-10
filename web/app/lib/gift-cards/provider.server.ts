import { adminClient } from '@/lib/supabase/adminClient'

const BATCH_SIZE = 100

export type GiftCardProvider = 'PC' | 'Sobeys'
export type GiftCardFulfillmentType = GiftCardProvider | 'meal_kit'

type ProfileRow = {
  id: string
  user_id: string | null
  role: string | null
  federal_electoral_district_name: string | null
}

type FamilyEdgeRow = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
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

const chunkArray = <T,>(items: T[]) => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += BATCH_SIZE) chunks.push(items.slice(index, index + BATCH_SIZE))
  return chunks
}

const addCandidate = (candidates: string[], profileId: string | null | undefined) => {
  if (profileId && !candidates.includes(profileId)) candidates.push(profileId)
}

const fulfillmentFromAnswer = (value: string | undefined): GiftCardFulfillmentType => {
  const normalized = (value ?? '').trim().toLowerCase()
  const compact = normalized.replace(/[^a-z0-9]+/g, '')
  if (compact.includes('mealkit') || normalized.includes('meal kit')) return 'meal_kit'
  return compact.includes('sobeys') || normalized.includes('sobeys') || normalized.includes("sobey's") ? 'Sobeys' : 'PC'
}

export const resolveGiftCardFulfillmentByProfileId = async (profileIds: string[]) => {
  const requestedProfileIds = Array.from(new Set(profileIds.filter(Boolean)))
  const fulfillmentByProfileId = new Map<string, GiftCardFulfillmentType>()
  const familyIdByProfileId = new Map<string, string>()
  if (!requestedProfileIds.length) return { fulfillmentByProfileId, familyIdByProfileId }

  const seen = new Set(requestedProfileIds)
  const queue = [...seen]
  const edges: FamilyEdgeRow[] = []
  while (queue.length) {
    const batch = queue.splice(0, BATCH_SIZE)
    const { data, error } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id, primary_child')
      .or(`guardian_profile_id.in.(${batch.join(',')}),child_profile_id.in.(${batch.join(',')})`)
    if (error) throw new Error(`Failed to load gift-card family relationships: ${error.message}`)
    for (const edge of (data ?? []) as FamilyEdgeRow[]) {
      edges.push(edge)
      for (const profileId of [edge.guardian_profile_id, edge.child_profile_id]) {
        if (!seen.has(profileId)) {
          seen.add(profileId)
          queue.push(profileId)
        }
      }
    }
  }

  const profiles: ProfileRow[] = []
  for (const chunk of chunkArray(Array.from(seen))) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, user_id, role, federal_electoral_district_name')
      .in('id', chunk)
    if (error) throw new Error(`Failed to load gift-card profiles: ${error.message}`)
    profiles.push(...((data ?? []) as ProfileRow[]))
  }
  const profileById = new Map(profiles.map(profile => [profile.id, profile]))

  const childrenByGuardianId = new Map<string, Array<{ id: string; primary: boolean }>>()
  const guardiansByChildId = new Map<string, Array<{ id: string; primary: boolean }>>()
  const adjacent = new Map<string, Set<string>>()
  for (const profileId of seen) adjacent.set(profileId, new Set())
  for (const edge of edges) {
    const childEntries = childrenByGuardianId.get(edge.guardian_profile_id) ?? []
    childEntries.push({ id: edge.child_profile_id, primary: edge.primary_child })
    childrenByGuardianId.set(edge.guardian_profile_id, childEntries)
    const guardianEntries = guardiansByChildId.get(edge.child_profile_id) ?? []
    guardianEntries.push({ id: edge.guardian_profile_id, primary: edge.primary_child })
    guardiansByChildId.set(edge.child_profile_id, guardianEntries)
    adjacent.get(edge.guardian_profile_id)?.add(edge.child_profile_id)
    adjacent.get(edge.child_profile_id)?.add(edge.guardian_profile_id)
  }
  const preferredRelatedId = (entries: Array<{ id: string; primary: boolean }> | undefined) =>
    [...(entries ?? [])].sort((left, right) => Number(right.primary) - Number(left.primary) || left.id.localeCompare(right.id))[0]?.id ?? null

  const familyProfileIdsByProfileId = new Map<string, string[]>()
  const visited = new Set<string>()
  for (const profileId of seen) {
    if (visited.has(profileId)) continue
    const members: string[] = []
    const stack = [profileId]
    visited.add(profileId)
    while (stack.length) {
      const current = stack.pop() as string
      members.push(current)
      for (const next of adjacent.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next)
          stack.push(next)
        }
      }
    }
    members.sort((left, right) => left.localeCompare(right))
    for (const member of members) {
      familyProfileIdsByProfileId.set(member, members)
      familyIdByProfileId.set(member, members[0])
    }
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
      const { data, error } = await adminClient
        .from('form_submission')
        .select('id, profile_id, user_id, submitted_at')
        .in(column, chunk)
      if (error) throw new Error(`Failed to load gift-card form submissions: ${error.message}`)
      for (const row of (data ?? []) as FormSubmissionRow[]) submissionsById.set(row.id, row)
    }
  }
  await loadSubmissions('profile_id', Array.from(seen))
  await loadSubmissions('user_id', Array.from(profilesByUserId.keys()))

  const latestPreferenceByProfileId = new Map<string, { value: string; submittedAt: number }>()
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
      const associatedProfileIds = new Set<string>()
      if (submission.profile_id) associatedProfileIds.add(submission.profile_id)
      if (submission.user_id) for (const profileId of profilesByUserId.get(submission.user_id) ?? []) associatedProfileIds.add(profileId)
      const submittedAt = Date.parse(submission.submitted_at ?? '') || 0
      for (const profileId of associatedProfileIds) {
        const previous = latestPreferenceByProfileId.get(profileId)
        if (!previous || submittedAt > previous.submittedAt) latestPreferenceByProfileId.set(profileId, { value, submittedAt })
      }
    }
  }

  const ridingNames = Array.from(new Set(profiles.map(profile => profile.federal_electoral_district_name?.trim()).filter(Boolean))) as string[]
  const mealKitRidings = new Set<string>()
  for (const chunk of chunkArray(ridingNames)) {
    const { data, error } = await adminClient.from('federal_electoral_district').select('name, meal_kit').in('name', chunk)
    if (error) throw new Error(`Failed to load meal-kit ridings: ${error.message}`)
    for (const riding of data ?? []) if (riding.meal_kit) mealKitRidings.add(riding.name)
  }

  for (const profileId of requestedProfileIds) {
    const profile = profileById.get(profileId)
    const studentId = profile?.role === 'student' ? profileId : preferredRelatedId(childrenByGuardianId.get(profileId)) ?? profileId
    const parentId = preferredRelatedId(guardiansByChildId.get(studentId)) ?? (profile?.role === 'guardian' ? profileId : null)
    const candidates: string[] = []
    addCandidate(candidates, studentId)
    addCandidate(candidates, parentId)
    for (const familyProfileId of familyProfileIdsByProfileId.get(profileId) ?? []) addCandidate(candidates, familyProfileId)
    for (const candidateId of [...candidates]) {
      for (const sameUserProfileId of profilesByUserId.get(profileById.get(candidateId)?.user_id ?? '') ?? []) {
        addCandidate(candidates, sameUserProfileId)
      }
    }
    addCandidate(candidates, profileId)

    if (candidates.some(candidateId => mealKitRidings.has(profileById.get(candidateId)?.federal_electoral_district_name?.trim() ?? ''))) {
      fulfillmentByProfileId.set(profileId, 'meal_kit')
      continue
    }
    const preference = candidates.map(candidateId => latestPreferenceByProfileId.get(candidateId)?.value).find(Boolean)
    fulfillmentByProfileId.set(profileId, fulfillmentFromAnswer(preference))
  }

  return { fulfillmentByProfileId, familyIdByProfileId }
}
