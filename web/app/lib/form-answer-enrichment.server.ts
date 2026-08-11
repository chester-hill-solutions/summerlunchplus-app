import { adminClient } from '@/lib/supabase/adminClient'

const PROFILE_BATCH_SIZE = 100
const SUBMISSION_BATCH_SIZE = 100
const PRIOR_PARTICIPATION_QUESTION_CODES = ['onboarding_prior_participation', 'child_prior_participation'] as const

type ProfileRow = {
  id: string
  user_id: string | null
  role: string | null
  federal_electoral_district_name: string | null
  riding_lookup_status: string | null
  riding_lookup_error: string | null
}

type FamilyEdge = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
}

type SubmissionRow = {
  id: string
  profile_id: string | null
  user_id: string | null
  submitted_at: string | null
}

type AnswerRow = {
  submission_id: string
  question_code: string
  value: unknown
}

export type FormAnswerEnrichment = {
  riding_display: string
  prior_participation_display: string
}

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const addRelated = (
  map: Map<string, Array<{ profileId: string; primary: boolean }>>,
  key: string,
  profileId: string,
  primary: boolean
) => {
  const values = map.get(key) ?? []
  if (!values.some(value => value.profileId === profileId)) {
    values.push({ profileId, primary })
    values.sort((left, right) => Number(right.primary) - Number(left.primary))
    map.set(key, values)
  }
}

const preferredRelated = (map: Map<string, Array<{ profileId: string; primary: boolean }>>, key: string) =>
  map.get(key)?.[0]?.profileId ?? null

const normalizeText = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)

const ridingStatusLabel = (status: string | null, error: string | null) => {
  if (status === 'matched') return '0. Lookup matched (district missing)'
  if (status === 'not_found') return error === 'district_not_seeded' ? '0. District not seeded' : '0. Postcode not found'
  if (status === 'error') return `0. Lookup error${error ? ` (${error})` : ''}`
  return status ? `0. Lookup ${status}` : null
}

const normalizeParticipation = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'yes') return 'Yes'
  if (normalized === 'no') return 'No'
  return value.trim()
}

export const loadFormAnswerEnrichment = async (profileIds: string[]) => {
  const requestedProfileIds = Array.from(new Set(profileIds.filter(Boolean)))
  const empty: Record<string, FormAnswerEnrichment> = {}
  if (!requestedProfileIds.length) return empty

  const guardiansByChild = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const childrenByGuardian = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const seen = new Set(requestedProfileIds)
  const queue = [...requestedProfileIds]

  while (queue.length) {
    const batch = queue.splice(0, PROFILE_BATCH_SIZE)
    const { data, error } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id, primary_child')
      .or(`guardian_profile_id.in.(${batch.join(',')}),child_profile_id.in.(${batch.join(',')})`)

    if (error) throw new Error(error.message)
    for (const edge of (data ?? []) as FamilyEdge[]) {
      addRelated(guardiansByChild, edge.child_profile_id, edge.guardian_profile_id, edge.primary_child)
      addRelated(childrenByGuardian, edge.guardian_profile_id, edge.child_profile_id, edge.primary_child)
      for (const relatedId of [edge.guardian_profile_id, edge.child_profile_id]) {
        if (!seen.has(relatedId)) {
          seen.add(relatedId)
          queue.push(relatedId)
        }
      }
    }
  }

  const profileScope = Array.from(seen)
  const profiles: ProfileRow[] = []
  for (const profileBatch of chunk(profileScope, PROFILE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, user_id, role, federal_electoral_district_name, riding_lookup_status, riding_lookup_error')
      .in('id', profileBatch)
    if (error) throw new Error(error.message)
    profiles.push(...((data ?? []) as ProfileRow[]))
  }

  const profileById = new Map(profiles.map(profile => [profile.id, profile]))
  const profileIdsByUserId = new Map<string, string[]>()
  for (const profile of profiles) {
    if (!profile.user_id) continue
    const values = profileIdsByUserId.get(profile.user_id) ?? []
    values.push(profile.id)
    profileIdsByUserId.set(profile.user_id, values)
  }

  const submissionsById = new Map<string, SubmissionRow>()
  for (const profileBatch of chunk(profileScope, PROFILE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('profile_id', profileBatch)
    if (error) throw new Error(error.message)
    for (const submission of (data ?? []) as SubmissionRow[]) submissionsById.set(submission.id, submission)
  }

  const userIds = Array.from(new Set(profiles.map(profile => profile.user_id).filter(Boolean))) as string[]
  for (const userBatch of chunk(userIds, PROFILE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('user_id', userBatch)
    if (error) throw new Error(error.message)
    for (const submission of (data ?? []) as SubmissionRow[]) submissionsById.set(submission.id, submission)
  }

  const latestParticipation = new Map<string, { value: string; submittedAt: number }>()
  const submissions = Array.from(submissionsById.values())
  for (const submissionBatch of chunk(submissions, SUBMISSION_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('form_answer')
      .select('submission_id, question_code, value')
      .in('submission_id', submissionBatch.map(submission => submission.id))
      .in('question_code', PRIOR_PARTICIPATION_QUESTION_CODES)
    if (error) throw new Error(error.message)

    for (const answer of (data ?? []) as AnswerRow[]) {
      const submission = submissionsById.get(answer.submission_id)
      const value = normalizeParticipation(answer.value)
      if (!submission || !value) continue
      const submittedAt = Date.parse(submission.submitted_at ?? '') || 0
      const associatedProfileIds = new Set<string>()
      if (submission.profile_id) associatedProfileIds.add(submission.profile_id)
      if (submission.user_id) {
        for (const relatedId of profileIdsByUserId.get(submission.user_id) ?? []) associatedProfileIds.add(relatedId)
      }
      for (const associatedId of associatedProfileIds) {
        const existing = latestParticipation.get(associatedId)
        if (!existing || submittedAt > existing.submittedAt) {
          latestParticipation.set(associatedId, { value, submittedAt })
        }
      }
    }
  }

  const result: Record<string, FormAnswerEnrichment> = {}
  for (const profileId of requestedProfileIds) {
    const profile = profileById.get(profileId)
    const studentId = profile?.role === 'student' ? profileId : preferredRelated(childrenByGuardian, profileId) ?? profileId
    const guardianId =
      (studentId ? preferredRelated(guardiansByChild, studentId) : null) ??
      (profile?.role === 'guardian' ? profileId : preferredRelated(guardiansByChild, profileId))
    const student = studentId ? profileById.get(studentId) : null
    const guardian = guardianId ? profileById.get(guardianId) : null
    const riding =
      normalizeText(student?.federal_electoral_district_name) ??
      normalizeText(guardian?.federal_electoral_district_name) ??
      normalizeText(profile?.federal_electoral_district_name) ??
      ridingStatusLabel(guardian?.riding_lookup_status ?? profile?.riding_lookup_status ?? null, guardian?.riding_lookup_error ?? profile?.riding_lookup_error ?? null) ??
      'Not looked up'
    const candidates = [studentId, guardianId, profileId].filter((id): id is string => Boolean(id))
    const participation = candidates.map(id => latestParticipation.get(id)?.value).find(Boolean) ?? 'N/A'
    result[profileId] = { riding_display: riding, prior_participation_display: participation }
  }

  return result
}
