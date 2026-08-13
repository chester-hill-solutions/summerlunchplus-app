import { sendTemplateEmail } from '@/lib/email/send-email.server'
import { ensurePostProgramSurveyCampaign } from '@/lib/post-program-survey/campaign.server'
import { adminClient } from '@/lib/supabase/adminClient'

const CAMPAIGN_PAGE_SIZE = 200
const EVENT_CLAIM_LIMIT = 100

const scheduledSlots = [
  { at: '2026-08-14T13:00:00.000Z', templateKey: 'post_program_survey_initial_v1' },
  { at: '2026-08-19T01:00:00.000Z', templateKey: 'post_program_survey_reminder_v1' },
  { at: '2026-08-21T01:00:00.000Z', templateKey: 'post_program_survey_reminder_v1' },
  { at: '2026-08-26T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
  { at: '2026-08-28T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
  { at: '2026-09-02T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
  { at: '2026-09-04T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
] as const

type TemplateKey = (typeof scheduledSlots)[number]['templateKey']

type RunSummary = {
  runId: string
  campaignsEnsured: number
  eventsCreated: number
  eventsClaimed: number
  emailsSent: number
  emailsSkipped: number
  emailFailures: number
  errors: string[]
}

type ClaimedEvent = {
  id: string
  campaign_id: string
  template_key: string
  recipient_email: string
  slot_at: string
  attempt_count: number
}

const publicOrigin = (appOrigin: string) => (process.env.PUBLIC_APP_ORIGIN?.trim().replace(/\/$/, '') || appOrigin)

const ensureCampaigns = async () => {
  let afterId = ''
  let campaignsEnsured = 0

  while (true) {
    let query = adminClient
      .from('workshop_enrollment')
      .select('id, semester_id, profile_id')
      .eq('status', 'approved')
      .not('profile_id', 'is', null)
      .order('id', { ascending: true })
      .limit(CAMPAIGN_PAGE_SIZE)

    if (afterId) query = query.gt('id', afterId)
    const { data: rows, error } = await query
    if (error) throw new Error(error.message)
    if (!rows?.length) break

    for (const row of rows) {
      afterId = row.id
      if (!row.profile_id) continue
      const campaignId = await ensurePostProgramSurveyCampaign({
        semesterId: row.semester_id,
        enrollmentProfileId: row.profile_id,
        availableAt: scheduledSlots[0].at,
      })
      if (campaignId) campaignsEnsured += 1
    }

    if (rows.length < CAMPAIGN_PAGE_SIZE) break
  }

  return campaignsEnsured
}

const createScheduledEvents = async (now: string, appOrigin: string) => {
  const { data: campaigns, error: campaignError } = await adminClient
    .from('post_program_survey_campaign')
    .select('id, semester_id, completed_at')
    .is('completed_at', null)
    .lte('available_at', now)

  if (campaignError) throw new Error(campaignError.message)
  if (!campaigns?.length) return 0

  const campaignIds = campaigns.map(campaign => campaign.id)
  const { data: members, error: memberError } = await adminClient
    .from('post_program_survey_campaign_member')
    .select('campaign_id, profile_id')
    .in('campaign_id', campaignIds)

  if (memberError) throw new Error(memberError.message)
  const profileIds = Array.from(new Set((members ?? []).map(member => member.profile_id)))
  if (!profileIds.length) return 0

  const { data: profiles, error: profileError } = await adminClient
    .from('profile')
    .select('id, role, email')
    .in('id', profileIds)

  if (profileError) throw new Error(profileError.message)
  const profileById = new Map((profiles ?? []).map(profile => [profile.id, profile]))
  const emailsByCampaign = new Map<string, Set<string>>()

  for (const member of members ?? []) {
    const profile = profileById.get(member.profile_id)
    if (profile?.role !== 'guardian') continue
    const email = profile.email?.trim().toLowerCase()
    if (!email) continue
    const emails = emailsByCampaign.get(member.campaign_id) ?? new Set<string>()
    emails.add(email)
    emailsByCampaign.set(member.campaign_id, emails)
  }

  const eventRows = campaigns.flatMap(campaign =>
    Array.from(emailsByCampaign.get(campaign.id) ?? []).flatMap(recipientEmail =>
      scheduledSlots.map(slot => ({
        campaign_id: campaign.id,
        template_key: slot.templateKey,
        slot_at: slot.at,
        recipient_email: recipientEmail,
        due_at: slot.at,
      }))
    )
  )

  if (!eventRows.length) return 0
  const { data, error } = await adminClient
    .from('post_program_survey_email_event')
    .upsert(eventRows, { onConflict: 'campaign_id,template_key,slot_at,recipient_email', ignoreDuplicates: true })
    .select('id')

  if (error) throw new Error(error.message)
  void appOrigin
  return data?.length ?? 0
}

const sendClaimedEvents = async (now: string, appOrigin: string) => {
  const { data: claimed, error: claimError } = await adminClient.rpc('claim_post_program_survey_email_events', {
    p_now: now,
    p_limit: EVENT_CLAIM_LIMIT,
  })
  if (claimError) throw new Error(claimError.message)
  const claimedEvents = (claimed ?? []) as ClaimedEvent[]
  if (!claimedEvents.length) return { eventsClaimed: 0, emailsSent: 0, emailsSkipped: 0, emailFailures: 0, errors: [] as string[] }

  const campaignIds = Array.from(new Set(claimedEvents.map(event => event.campaign_id)))
  const { data: campaigns, error: campaignError } = await adminClient
    .from('post_program_survey_campaign')
    .select('id, semester_id, completed_at')
    .in('id', campaignIds)

  if (campaignError) throw new Error(campaignError.message)
  const origin = publicOrigin(appOrigin)
  let emailsSent = 0
  let emailsSkipped = 0
  let emailFailures = 0
  const errors: string[] = []

  for (const event of claimedEvents) {
    const campaign = (campaigns ?? []).find(row => row.id === event.campaign_id)
    const semesterId = campaign?.semester_id
    if (!semesterId) {
      await adminClient.rpc('fail_post_program_survey_email_event', {
        p_event_id: event.id,
        p_error: 'Campaign semester is missing',
      })
      emailFailures += 1
      continue
    }

    if (campaign.completed_at) {
      await adminClient.rpc('fail_post_program_survey_email_event', {
        p_event_id: event.id,
        p_error: 'Campaign completed before send',
      })
      emailsSkipped += 1
      continue
    }

    const result = await sendTemplateEmail({
      toEmail: event.recipient_email,
      templateKey: event.template_key as TemplateKey,
      templateData: {
        recipientName: '',
        surveyUrl: `${origin}/semester-surveys/${semesterId}/post-program`,
      },
      eventKey: `post-program-survey:${event.id}:attempt:${event.attempt_count}`,
    })

    if (result.status === 'failed') {
      await adminClient.rpc('fail_post_program_survey_email_event', {
        p_event_id: event.id,
        p_error: result.error ?? 'Email send failed',
      })
      emailFailures += 1
      errors.push(`event ${event.id}: ${result.error ?? 'Email send failed'}`)
      continue
    }

    const { error: completeError } = await adminClient.rpc('complete_post_program_survey_email_event', {
      p_event_id: event.id,
      p_email_message_id: result.id,
    })
    if (completeError) {
      emailFailures += 1
      errors.push(`event ${event.id}: ${completeError.message}`)
      continue
    }

    if (result.status === 'sent') emailsSent += 1
    else emailsSkipped += 1
  }

  return { eventsClaimed: claimedEvents.length, emailsSent, emailsSkipped, emailFailures, errors }
}

export const runPostProgramSurveyJobs = async ({ appOrigin, runId }: { appOrigin: string; runId: string }): Promise<RunSummary> => {
  const errors: string[] = []
  let campaignsEnsured = 0
  let eventsCreated = 0
  let sent = { eventsClaimed: 0, emailsSent: 0, emailsSkipped: 0, emailFailures: 0, errors: [] as string[] }

  try {
    campaignsEnsured = await ensureCampaigns()
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Campaign creation failed')
  }

  try {
    eventsCreated = await createScheduledEvents(new Date().toISOString(), appOrigin)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Event creation failed')
  }

  try {
    sent = await sendClaimedEvents(new Date().toISOString(), appOrigin)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Email send failed')
  }

  return {
    runId,
    campaignsEnsured,
    eventsCreated,
    ...sent,
    errors: [...errors, ...sent.errors],
  }
}
