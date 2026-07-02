import { adminClient } from '@/lib/supabase/adminClient'

const RELATIONSHIP_BATCH_SIZE = 100
const IN_CLAUSE_BATCH_SIZE = 250

export const GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE = 'gift_card_store_preference'
export const ADMIN_EDITABLE_FAMILY_QUESTION_CODES = new Set<string>([
  GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE,
])

type FamilyGraph = {
  profileIds: string[]
}

type ProfileIdentity = {
  id: string
  user_id: string | null
}

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0 || !items.length) return []
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const loadFamilyGraph = async (seedProfileId: string): Promise<FamilyGraph> => {
  const seen = new Set<string>([seedProfileId])
  const queue: string[] = [seedProfileId]

  while (queue.length) {
    const batch = queue.splice(0, Math.min(queue.length, RELATIONSHIP_BATCH_SIZE))
    const { data: edges, error } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id')
      .or(`guardian_profile_id.in.(${batch.join(',')}),child_profile_id.in.(${batch.join(',')})`)

    if (error) {
      throw new Error(error.message)
    }

    for (const edge of edges ?? []) {
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

  return { profileIds: Array.from(seen) }
}

const loadCandidateProfileIds = async (seedProfileId: string) => {
  const { profileIds: familyProfileIds } = await loadFamilyGraph(seedProfileId)

  const baseProfiles: ProfileIdentity[] = []
  for (const profileChunk of chunkArray(familyProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, user_id')
      .in('id', profileChunk)

    if (error) throw new Error(error.message)
    baseProfiles.push(...((data ?? []) as ProfileIdentity[]))
  }

  const userIds = Array.from(
    new Set(baseProfiles.map(profile => profile.user_id).filter((value): value is string => Boolean(value)))
  )

  const sameUserProfiles: ProfileIdentity[] = []
  for (const userChunk of chunkArray(userIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, user_id')
      .in('user_id', userChunk)

    if (error) throw new Error(error.message)
    sameUserProfiles.push(...((data ?? []) as ProfileIdentity[]))
  }

  const allProfileIds = Array.from(
    new Set([...baseProfiles, ...sameUserProfiles].map(profile => profile.id).filter(Boolean))
  )

  return {
    candidateProfileIds: allProfileIds,
    candidateUserIds: Array.from(
      new Set(
        [...baseProfiles, ...sameUserProfiles]
          .map(profile => profile.user_id)
          .filter((value): value is string => Boolean(value))
      )
    ),
  }
}

type UpsertAdminFamilyFormAnswerInput = {
  seedProfileId: string
  targetProfileId?: string | null
  questionCode: string
  value: string
  actorUserId: string
}

type UpsertAdminFamilyFormAnswerResult =
  | {
      ok: true
      targetProfileId: string
      questionCode: string
      value: string
    }
  | {
      ok: false
      error: string
    }

export async function upsertAdminFamilyFormAnswer(
  input: UpsertAdminFamilyFormAnswerInput
): Promise<UpsertAdminFamilyFormAnswerResult> {
  const seedProfileId = input.seedProfileId.trim()
  const desiredTargetProfileId = (input.targetProfileId ?? '').trim()
  const questionCode = input.questionCode.trim()
  const value = input.value.trim()

  if (!seedProfileId) return { ok: false, error: 'Missing seed profile id.' }
  if (!questionCode) return { ok: false, error: 'Missing question code.' }
  if (!ADMIN_EDITABLE_FAMILY_QUESTION_CODES.has(questionCode)) {
    return { ok: false, error: 'Question code is not editable.' }
  }
  if (!value) return { ok: false, error: 'Value is required.' }

  const { candidateProfileIds, candidateUserIds } = await loadCandidateProfileIds(seedProfileId)
  if (!candidateProfileIds.length) {
    return { ok: false, error: 'No family profiles found.' }
  }

  const targetProfileId = desiredTargetProfileId || seedProfileId
  if (!candidateProfileIds.includes(targetProfileId)) {
    return { ok: false, error: 'Target profile must belong to the same family context.' }
  }

  const submissionsById = new Map<string, { id: string; profile_id: string | null; submitted_at: string | null }>()

  for (const profileChunk of chunkArray(candidateProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, submitted_at')
      .in('profile_id', profileChunk)

    if (error) return { ok: false, error: error.message }
    for (const row of data ?? []) {
      submissionsById.set(row.id, row)
    }
  }

  for (const userChunk of chunkArray(candidateUserIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, submitted_at')
      .in('user_id', userChunk)

    if (error) return { ok: false, error: error.message }
    for (const row of data ?? []) {
      submissionsById.set(row.id, row)
    }
  }

  const submissionIds = Array.from(submissionsById.keys())
  let existingAnswer: { id: string; submission_id: string } | null = null

  for (const submissionChunk of chunkArray(submissionIds, IN_CLAUSE_BATCH_SIZE)) {
    if (!submissionChunk.length) continue
    const { data, error } = await adminClient
      .from('form_answer')
      .select('id, submission_id')
      .eq('question_code', questionCode)
      .in('submission_id', submissionChunk)

    if (error) return { ok: false, error: error.message }

    for (const answer of data ?? []) {
      const submission = submissionsById.get(answer.submission_id)
      if (!submission) continue
      const currentAt = Date.parse(submission.submitted_at ?? '') || 0
      const existingAt = existingAnswer
        ? Date.parse(submissionsById.get(existingAnswer.submission_id)?.submitted_at ?? '') || 0
        : Number.NEGATIVE_INFINITY
      if (!existingAnswer || currentAt > existingAt) {
        existingAnswer = { id: answer.id, submission_id: answer.submission_id }
      }
    }
  }

  if (existingAnswer) {
    const { error } = await adminClient
      .from('form_answer')
      .update({ value })
      .eq('id', existingAnswer.id)

    if (error) return { ok: false, error: error.message }

    return {
      ok: true,
      targetProfileId,
      questionCode,
      value,
    }
  }

  const targetSubmission = Array.from(submissionsById.values())
    .filter(submission => submission.profile_id === targetProfileId)
    .sort((left, right) => (Date.parse(right.submitted_at ?? '') || 0) - (Date.parse(left.submitted_at ?? '') || 0))[0]

  let submissionId = targetSubmission?.id ?? null

  if (!submissionId) {
    const { data: mappedForm, error: mappedFormError } = await adminClient
      .from('form_question_map')
      .select('form_id')
      .eq('question_code', questionCode)
      .limit(1)
      .maybeSingle()

    if (mappedFormError) return { ok: false, error: mappedFormError.message }
    if (!mappedForm?.form_id) {
      return { ok: false, error: 'No form mapping found for this question.' }
    }

    const { data: targetProfile, error: profileError } = await adminClient
      .from('profile')
      .select('user_id')
      .eq('id', targetProfileId)
      .maybeSingle()

    if (profileError) return { ok: false, error: profileError.message }

    const { data: insertedSubmission, error: insertSubmissionError } = await adminClient
      .from('form_submission')
      .insert({
        form_id: mappedForm.form_id,
        profile_id: targetProfileId,
        user_id: targetProfile?.user_id ?? null,
        metadata: {
          adminEdited: true,
          actorUserId: input.actorUserId,
          source: 'manage-admin-form-answer',
        },
      })
      .select('id')
      .single()

    if (insertSubmissionError) return { ok: false, error: insertSubmissionError.message }
    submissionId = insertedSubmission?.id ?? null
  }

  if (!submissionId) {
    return { ok: false, error: 'Unable to resolve submission for answer update.' }
  }

  const { error: insertAnswerError } = await adminClient
    .from('form_answer')
    .insert({
      submission_id: submissionId,
      question_code: questionCode,
      value,
    })

  if (insertAnswerError) return { ok: false, error: insertAnswerError.message }

  return {
    ok: true,
    targetProfileId,
    questionCode,
    value,
  }
}
