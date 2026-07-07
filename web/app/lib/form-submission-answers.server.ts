import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/database.types'

const IN_CLAUSE_BATCH_SIZE = 150

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

type SubmissionRow = {
  id: string
  form_id: string | null
  submitted_at: string | null
}

type FormAnswerRow = {
  submission_id: string
  question_code: string | null
  value: Json
}

export const loadSubmissionAnswerState = async (
  supabase: SupabaseClient<Database>,
  profileId: string
): Promise<{
  submissions: SubmissionRow[]
  answers: Record<string, Json>
  byForm: Record<string, Record<string, Json>>
}> => {
  const { data: submissionsData, error: submissionsError } = await supabase
    .from('form_submission')
    .select('id, form_id, submitted_at')
    .eq('profile_id', profileId)
    .order('submitted_at', { ascending: true })

  if (submissionsError) {
    throw new Error(submissionsError.message)
  }

  const submissions = (submissionsData ?? []) as SubmissionRow[]
  if (!submissions.length) {
    return {
      submissions: [],
      answers: {},
      byForm: {},
    }
  }

  const submissionIds = submissions.map(submission => submission.id)
  const answerRows: FormAnswerRow[] = []

  for (const chunk of chunkArray(submissionIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: answerChunk, error: answerError } = await supabase
      .from('form_answer')
      .select('submission_id, question_code, value')
      .in('submission_id', chunk)

    if (answerError) {
      throw new Error(answerError.message)
    }

    answerRows.push(...((answerChunk ?? []) as FormAnswerRow[]))
  }

  const answersBySubmissionId = new Map<string, FormAnswerRow[]>()
  for (const answer of answerRows) {
    const existing = answersBySubmissionId.get(answer.submission_id) ?? []
    existing.push(answer)
    answersBySubmissionId.set(answer.submission_id, existing)
  }

  const answers: Record<string, Json> = {}
  const byForm: Record<string, Record<string, Json>> = {}

  for (const submission of submissions) {
    if (!submission.form_id) continue
    const formAnswers: Record<string, Json> = {}

    for (const answer of answersBySubmissionId.get(submission.id) ?? []) {
      if (!answer.question_code) continue
      formAnswers[answer.question_code] = answer.value
      answers[answer.question_code] = answer.value
    }

    byForm[submission.form_id] = formAnswers
  }

  return {
    submissions,
    answers,
    byForm,
  }
}
