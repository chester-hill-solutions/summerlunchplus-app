import { adminClient } from '@/lib/supabase/adminClient'

const GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE = 'gift_card_store_preference'
const RELATIONSHIP_BATCH_SIZE = 100
const IN_CLAUSE_BATCH_SIZE = 250

type RidingProfileRow = {
  id: string
  role: string | null
  firstname: string | null
  surname: string | null
  email: string | null
  federal_electoral_district_name: string | null
}

type GuardianChildEdge = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
}

type FormSubmissionRow = {
  id: string
  profile_id: string | null
  submitted_at: string | null
}

type FormAnswerRow = {
  submission_id: string
  value: unknown
}

export type WorkshopEnrollmentEnrichment = {
  riding_display: string
  giftcard_display: string
  profile_hover_name: string
  profile_hover_email: string
  profile_hover_parent_email: string
}

const normalizeRiding = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const normalizeText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const fullNameFromProfile = (profile: RidingProfileRow | null | undefined) => {
  const firstname = normalizeText(profile?.firstname)
  const surname = normalizeText(profile?.surname)
  const fullName = [firstname, surname].filter(Boolean).join(' ').trim()
  return fullName || null
}

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0 || !items.length) return []

  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const pushEdge = (
  map: Map<string, Array<{ profileId: string; primary: boolean }>>,
  key: string,
  profileId: string,
  primary: boolean
) => {
  const current = map.get(key) ?? []
  if (!current.some(item => item.profileId === profileId)) {
    current.push({ profileId, primary })
    current.sort((left, right) => Number(right.primary) - Number(left.primary))
    map.set(key, current)
  }
}

const preferredRelatedProfileId = (
  map: Map<string, Array<{ profileId: string; primary: boolean }>>,
  key: string
) => map.get(key)?.[0]?.profileId ?? null

export async function loadWorkshopEnrollmentEnrichment(profileIds: string[]) {
  const normalizedProfileIds = Array.from(new Set(profileIds.filter(Boolean)))
  const byProfileId: Record<string, WorkshopEnrollmentEnrichment> = {}

  if (!normalizedProfileIds.length) {
    return byProfileId
  }

  let profileById = new Map<string, RidingProfileRow>()
  const guardiansByChildId = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const childrenByGuardianId = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const familyProfileIdsByProfileId = new Map<string, string[]>()
  const mealKitByProfileId = new Map<string, boolean>()
  let giftCardPreferenceByProfileId = new Map<string, string>()

  const seen = new Set<string>(normalizedProfileIds)
  const queue = [...normalizedProfileIds]
  const familyEdges: GuardianChildEdge[] = []

  while (queue.length) {
    const batch = queue.splice(0, Math.min(queue.length, RELATIONSHIP_BATCH_SIZE))
    const { data: batchEdges, error: familyEdgesError } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id, primary_child')
      .or(`guardian_profile_id.in.(${batch.join(',')}),child_profile_id.in.(${batch.join(',')})`)

    if (familyEdgesError) {
      console.error('[workshop enrollment] enrichment failed to load family edges', {
        batchSize: batch.length,
        error: familyEdgesError.message,
      })
      break
    }

    for (const edge of (batchEdges ?? []) as GuardianChildEdge[]) {
      familyEdges.push(edge)
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

  for (const edge of familyEdges) {
    pushEdge(guardiansByChildId, edge.child_profile_id, edge.guardian_profile_id, edge.primary_child)
    pushEdge(childrenByGuardianId, edge.guardian_profile_id, edge.child_profile_id, edge.primary_child)
  }

  const profileScope = Array.from(seen)
  const familyAdjacency = new Map<string, Set<string>>()
  for (const profileId of profileScope) {
    if (!familyAdjacency.has(profileId)) {
      familyAdjacency.set(profileId, new Set())
    }
  }

  for (const edge of familyEdges) {
    if (!familyAdjacency.has(edge.guardian_profile_id)) {
      familyAdjacency.set(edge.guardian_profile_id, new Set())
    }
    if (!familyAdjacency.has(edge.child_profile_id)) {
      familyAdjacency.set(edge.child_profile_id, new Set())
    }
    familyAdjacency.get(edge.guardian_profile_id)?.add(edge.child_profile_id)
    familyAdjacency.get(edge.child_profile_id)?.add(edge.guardian_profile_id)
  }

  const profileRows: RidingProfileRow[] = []
  for (const profileChunk of chunkArray(profileScope, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, role, firstname, surname, email, federal_electoral_district_name')
      .in('id', profileChunk)

    if (error) {
      console.error('[workshop enrollment] enrichment failed to load profile rows', {
        chunkSize: profileChunk.length,
        error: error.message,
      })
      continue
    }

    profileRows.push(...((data ?? []) as RidingProfileRow[]))
  }

  if (!profileRows.length) {
    return byProfileId
  }

  profileById = new Map(
    profileRows
      .filter(profile => typeof profile.id === 'string' && profile.id)
      .map(profile => [profile.id, profile])
  )

  const visited = new Set<string>()
  for (const rootProfileId of profileScope) {
    if (visited.has(rootProfileId)) continue

    const familyIds: string[] = []
    const bfsQueue = [rootProfileId]
    visited.add(rootProfileId)

    while (bfsQueue.length) {
      const currentProfileId = bfsQueue.shift()
      if (!currentProfileId) continue
      familyIds.push(currentProfileId)

      for (const neighbor of familyAdjacency.get(currentProfileId) ?? []) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        bfsQueue.push(neighbor)
      }
    }

    familyIds.sort((left, right) => left.localeCompare(right))
    for (const familyProfileId of familyIds) {
      familyProfileIdsByProfileId.set(familyProfileId, familyIds)
    }
  }

  const ridingNames = Array.from(
    new Set(
      profileRows
        .map(profile => normalizeRiding(profile.federal_electoral_district_name))
        .filter((riding): riding is string => Boolean(riding))
    )
  )

  const mealKitByRidingName = new Map<string, boolean>()
  if (ridingNames.length) {
    for (const ridingChunk of chunkArray(ridingNames, IN_CLAUSE_BATCH_SIZE)) {
      const { data: ridingRows, error: ridingRowsError } = await adminClient
        .from('federal_electoral_district')
        .select('name, meal_kit')
        .in('name', ridingChunk)

      if (ridingRowsError) {
        console.error('[workshop enrollment] enrichment failed to load riding meal-kit rows', {
          chunkSize: ridingChunk.length,
          error: ridingRowsError.message,
        })
        continue
      }

      for (const riding of ridingRows ?? []) {
        if (typeof riding.name !== 'string') continue
        mealKitByRidingName.set(riding.name, riding.meal_kit === true)
      }
    }
  }

  for (const profile of profileById.values()) {
    const ridingName = normalizeRiding(profile.federal_electoral_district_name)
    if (!ridingName) {
      mealKitByProfileId.set(profile.id, false)
      continue
    }

    mealKitByProfileId.set(profile.id, mealKitByRidingName.get(ridingName) === true)
  }

  const submissions: FormSubmissionRow[] = []
  for (const profileChunk of chunkArray(profileScope, IN_CLAUSE_BATCH_SIZE)) {
    const { data: submissionRows, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, submitted_at')
      .in('profile_id', profileChunk)

    if (error) {
      console.error('[workshop enrollment] enrichment failed to load form submissions', {
        chunkSize: profileChunk.length,
        error: error.message,
      })
      continue
    }

    submissions.push(...((submissionRows ?? []) as FormSubmissionRow[]))
  }

  if (submissions.length) {
    const submissionIds = submissions
      .map(submission => submission.id)
      .filter((submissionId): submissionId is string => Boolean(submissionId))

    if (submissionIds.length) {
      const answerRows: FormAnswerRow[] = []
      for (const submissionChunk of chunkArray(submissionIds, IN_CLAUSE_BATCH_SIZE)) {
        const { data, error } = await adminClient
          .from('form_answer')
          .select('submission_id, value')
          .eq('question_code', GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE)
          .in('submission_id', submissionChunk)

        if (error) {
          console.error('[workshop enrollment] enrichment failed to load gift card answers', {
            chunkSize: submissionChunk.length,
            error: error.message,
          })
          continue
        }

        answerRows.push(...((data ?? []) as FormAnswerRow[]))
      }

      if (answerRows.length) {
        const submissionById = new Map(submissions.map(submission => [submission.id, submission]))
        const latestGiftCardByProfileId = new Map<string, { value: string; submittedAt: number }>()

        for (const answer of answerRows) {
          const submission = submissionById.get(answer.submission_id)
          const profileId = submission?.profile_id
          if (!profileId) continue

          const value = typeof answer.value === 'string' ? answer.value.trim() : ''
          if (!value) continue

          const submittedAt = Date.parse(submission?.submitted_at ?? '')
          const submittedAtTime = Number.isNaN(submittedAt) ? 0 : submittedAt
          const existing = latestGiftCardByProfileId.get(profileId)

          if (!existing || submittedAtTime > existing.submittedAt) {
            latestGiftCardByProfileId.set(profileId, {
              value,
              submittedAt: submittedAtTime,
            })
          }
        }

        giftCardPreferenceByProfileId = new Map(
          Array.from(latestGiftCardByProfileId.entries()).map(([profileId, entry]) => [profileId, entry.value])
        )
      }
    }
  }

  for (const profileId of normalizedProfileIds) {
    const enrollmentProfile = profileById.get(profileId) ?? null

    const inferredStudentProfileId = (() => {
      if (!profileId) return null
      if (enrollmentProfile?.role === 'student') return profileId
      if (enrollmentProfile?.role === 'guardian') {
        return preferredRelatedProfileId(childrenByGuardianId, profileId)
      }

      const directChild = preferredRelatedProfileId(childrenByGuardianId, profileId)
      if (directChild) return directChild
      return profileId
    })()

    const studentRiding = inferredStudentProfileId
      ? normalizeRiding(profileById.get(inferredStudentProfileId)?.federal_electoral_district_name)
      : null

    const inferredParentProfileId = (() => {
      if (!profileId) return null
      if (inferredStudentProfileId) {
        const guardianId = preferredRelatedProfileId(guardiansByChildId, inferredStudentProfileId)
        if (guardianId) return guardianId
      }
      if (enrollmentProfile?.role === 'guardian') return profileId
      return preferredRelatedProfileId(guardiansByChildId, profileId)
    })()

    const parentRiding = inferredParentProfileId
      ? normalizeRiding(profileById.get(inferredParentProfileId)?.federal_electoral_district_name)
      : null

    const ridingDisplay =
      studentRiding ?? parentRiding ?? normalizeRiding(enrollmentProfile?.federal_electoral_district_name) ?? ''

    const profileHoverName = fullNameFromProfile(enrollmentProfile) ?? 'N/A'
    const profileHoverEmail = normalizeText(enrollmentProfile?.email) ?? 'N/A'
    const profileHoverParentEmail = inferredParentProfileId
      ? normalizeText(profileById.get(inferredParentProfileId)?.email) ?? 'N/A'
      : 'N/A'

    const candidateProfileIds: string[] = []
    const addCandidate = (candidateId: string | null) => {
      if (!candidateId || candidateProfileIds.includes(candidateId)) return
      candidateProfileIds.push(candidateId)
    }

    addCandidate(inferredStudentProfileId)
    addCandidate(inferredParentProfileId)

    for (const familyProfileId of familyProfileIdsByProfileId.get(profileId) ?? []) {
      addCandidate(familyProfileId)
    }

    addCandidate(profileId || null)

    const giftcardDisplay = (() => {
      for (const candidateProfileId of candidateProfileIds) {
        if (mealKitByProfileId.get(candidateProfileId) === true) {
          return 'Meal Kit'
        }

        const giftCardChoice = giftCardPreferenceByProfileId.get(candidateProfileId)
        if (giftCardChoice) {
          return giftCardChoice
        }
      }

      return 'N/A'
    })()

    byProfileId[profileId] = {
      riding_display: ridingDisplay,
      giftcard_display: giftcardDisplay,
      profile_hover_name: profileHoverName,
      profile_hover_email: profileHoverEmail,
      profile_hover_parent_email: profileHoverParentEmail,
    }
  }

  return byProfileId
}
