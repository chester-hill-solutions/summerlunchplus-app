import { adminClient } from '@/lib/supabase/adminClient'
import { isLastWorkshopClass } from '@/lib/post-program-survey/gift-card-guard'

export type PostProgramSurveyHold = {
  held: boolean
  reason: string | null
}

export async function getPostProgramSurveyHold(classId: string, profileId: string): Promise<PostProgramSurveyHold> {
  const { data: classRow, error: classError } = await adminClient
    .from('class')
    .select('id, workshop_id, ends_at, workshop:workshop_id(semester_id)')
    .eq('id', classId)
    .maybeSingle()

  if (classError || !classRow?.workshop_id) return { held: false, reason: null }
  const workshop = Array.isArray(classRow.workshop) ? classRow.workshop[0] : classRow.workshop
  if (!workshop?.semester_id) return { held: false, reason: null }

  const [{ data: activeForm }, { data: workshopClasses }, { data: enrollment }] = await Promise.all([
    adminClient
      .from('semester_form_requirement')
      .select('id')
      .eq('semester_id', workshop.semester_id)
      .eq('is_active', true)
      .in('kind', ['post_survey', 'post_program_survey'] as never)
      .maybeSingle(),
    adminClient.from('class').select('id, ends_at').eq('workshop_id', classRow.workshop_id),
    adminClient
      .from('workshop_enrollment')
      .select('id')
      .eq('workshop_id', classRow.workshop_id)
      .eq('semester_id', workshop.semester_id)
      .eq('profile_id', profileId)
      .eq('status', 'approved')
      .maybeSingle(),
  ])

  if (!activeForm?.id || !enrollment?.id || !isLastWorkshopClass({ classId, classEndsAt: classRow.ends_at, workshopClasses: workshopClasses ?? [] })) {
    return { held: false, reason: null }
  }

  const { data: campaignEnrollment } = await adminClient
    .from('post_program_survey_campaign_enrollment')
    .select('campaign:campaign_id(completed_at)')
    .eq('workshop_enrollment_id', enrollment.id)
    .maybeSingle()

  const campaign = Array.isArray(campaignEnrollment?.campaign) ? campaignEnrollment?.campaign[0] : campaignEnrollment?.campaign
  if (!campaign || campaign.completed_at) return { held: false, reason: null }
  return { held: true, reason: 'Post-program survey required' }
}
