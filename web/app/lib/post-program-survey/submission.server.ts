import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/database.types'

type CampaignClient = SupabaseClient<Database>

export type PostProgramSurveyCompletion = {
  campaignId: string
  submissionId: string
  completedAt: string
}

export async function completePostProgramSurveyCampaign({
  supabase,
  campaignId,
  answers,
  requestMetadata,
}: {
  supabase: CampaignClient
  campaignId: string
  answers: Json
  requestMetadata: Json
}): Promise<PostProgramSurveyCompletion> {
  const { data, error } = await supabase
    .rpc('complete_post_program_survey_campaign', {
      p_campaign_id: campaignId,
      p_answers: answers,
      p_request_metadata: requestMetadata,
    })
    .single()

  if (error) throw new Error(error.message)
  if (!data?.campaign_id || !data.submission_id || !data.completed_at) {
    throw new Error('Campaign completion did not return a submission')
  }

  return {
    campaignId: data.campaign_id,
    submissionId: data.submission_id,
    completedAt: data.completed_at,
  }
}
