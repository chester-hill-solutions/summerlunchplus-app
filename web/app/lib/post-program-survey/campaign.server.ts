import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'
import { chunk } from '@/lib/post-program-survey/batching.server'
import { resolveConnectedProfileIds } from '@/lib/family.server'
import { resolveSemesterSurveyForm } from '@/lib/semester-survey.server'
import { adminClient } from '@/lib/supabase/adminClient'

type CampaignClient = SupabaseClient<Database>

export type PostProgramSurveyCampaign = Pick<
  Database['public']['Tables']['post_program_survey_campaign']['Row'],
  'id' | 'semester_id' | 'form_id' | 'survey_profile_id' | 'available_at' | 'completed_at'
>

export async function ensurePostProgramSurveyCampaign({
  semesterId,
  enrollmentProfileId,
  availableAt,
}: {
  semesterId: string
  enrollmentProfileId: string
  availableAt: string
}) {
  const familyProfileIds = Array.from(new Set(await resolveConnectedProfileIds(adminClient, [enrollmentProfileId]))).sort()
  const familyAnchorProfileId = familyProfileIds[0]
  if (!familyAnchorProfileId) {
    throw new Error('Campaign family is empty')
  }

  const survey = await resolveSemesterSurveyForm(semesterId, 'post_program_survey')
  if (!survey.formId) {
    return null
  }

  const { data: enrollments, error: enrollmentError } = await adminClient
    .from('workshop_enrollment')
    .select('id')
    .eq('semester_id', semesterId)
    .eq('status', 'approved')
    .in('profile_id', familyProfileIds)

  if (enrollmentError) throw new Error(enrollmentError.message)
  const enrollmentIds = (enrollments ?? []).map(enrollment => enrollment.id)
  if (!enrollmentIds.length) return null

  const { data: campaignId, error: campaignError } = await adminClient.rpc('ensure_post_program_survey_campaign', {
    p_semester_id: semesterId,
    p_form_id: survey.formId,
    p_family_anchor_profile_id: familyAnchorProfileId,
    p_survey_profile_id: enrollmentProfileId,
    p_member_profile_ids: familyProfileIds,
    p_workshop_enrollment_ids: enrollmentIds,
    p_available_at: availableAt,
  })

  if (campaignError) throw new Error(campaignError.message)
  return campaignId
}

export async function loadPostProgramSurveyCampaignForCurrentProfile(
  supabase: CampaignClient,
  semesterId: string
): Promise<PostProgramSurveyCampaign | null> {
  const { data: profileId, error: profileError } = await supabase.rpc('current_profile_id')
  if (profileError) throw new Error(profileError.message)
  if (!profileId) return null

  const { data: membership, error: membershipError } = await supabase
    .from('post_program_survey_campaign_member')
    .select('campaign_id')
    .eq('profile_id', profileId)

  if (membershipError) throw new Error(membershipError.message)
  const campaignIds = (membership ?? []).map(member => member.campaign_id)
  if (!campaignIds.length) return null

  for (const ids of chunk(campaignIds)) {
    const { data: campaigns, error: campaignError } = await supabase
      .from('post_program_survey_campaign')
      .select('id, semester_id, form_id, survey_profile_id, available_at, completed_at')
      .eq('semester_id', semesterId)
      .in('id', ids)
      .limit(1)

    if (campaignError) throw new Error(campaignError.message)
    if (campaigns?.[0]) return campaigns[0]
  }

  return null
}

export async function loadIncompletePostProgramSurveyCampaignsForCurrentProfile(
  supabase: CampaignClient,
  now = new Date().toISOString()
): Promise<PostProgramSurveyCampaign[]> {
  const { data: profileId, error: profileError } = await supabase.rpc('current_profile_id')
  if (profileError) throw new Error(profileError.message)
  if (!profileId) return []

  const { data: membership, error: membershipError } = await supabase
    .from('post_program_survey_campaign_member')
    .select('campaign_id')
    .eq('profile_id', profileId)

  if (membershipError) throw new Error(membershipError.message)
  const campaignIds = (membership ?? []).map(member => member.campaign_id)
  if (!campaignIds.length) return []

  const campaigns: PostProgramSurveyCampaign[] = []
  for (const ids of chunk(campaignIds)) {
    const { data: batch, error: campaignError } = await supabase
      .from('post_program_survey_campaign')
      .select('id, semester_id, form_id, survey_profile_id, available_at, completed_at')
      .in('id', ids)
      .is('completed_at', null)
      .lte('available_at', now)
      .order('available_at', { ascending: true })

    if (campaignError) throw new Error(campaignError.message)
    campaigns.push(...(batch ?? []))
  }

  return campaigns.sort((left, right) => left.available_at.localeCompare(right.available_at))
}
