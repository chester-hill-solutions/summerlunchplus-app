import { sendTemplateEmail } from '@/lib/email/send-email.server'
import { chunk } from '@/lib/post-program-survey/batching.server'
import { ensurePostProgramSurveyCampaign } from '@/lib/post-program-survey/campaign.server'
import { assertPostProgramSurveySchedule, POST_PROGRAM_SURVEY_SCHEDULE } from '@/lib/post-program-survey/schedule'
import { adminClient } from '@/lib/supabase/adminClient'

const CAMPAIGN_PAGE_SIZE = 100
const EVENT_CLAIM_LIMIT = 100
const RUNNER_JOB_KEY = 'post-program-survey'
const RUNNER_LEASE_SECONDS = 240

type TemplateKey = (typeof POST_PROGRAM_SURVEY_SCHEDULE)[number]['templateKey']
assertPostProgramSurveySchedule()

type RunSummary = {
  runId: string
  campaignsEnsured: number
  eventsCreated: number
  eventsClaimed: number
  emailsSent: number
  emailsSkipped: number
  emailFailures: number
  campaignRowsScanned: number
  durationMs: number
  skipped: boolean
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

const ensureCampaigns = async (availableAt: string, afterId: string | null) => {
  let campaignsEnsured = 0
  let lastEnrollmentId = afterId
  let rowsScanned = 0

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
  rowsScanned = rows?.length ?? 0

  for (const row of rows ?? []) {
    lastEnrollmentId = row.id
    if (!row.profile_id) continue
    const campaignId = await ensurePostProgramSurveyCampaign({
      semesterId: row.semester_id,
      enrollmentProfileId: row.profile_id,
      availableAt,
    })
    if (campaignId) campaignsEnsured += 1
  }

  return {
    campaignsEnsured,
    rowsScanned,
    lastEnrollmentId: (rows?.length ?? 0) < CAMPAIGN_PAGE_SIZE ? null : lastEnrollmentId,
  }
}

const createScheduledEvents = async (now: string, appOrigin: string) => {
  const { data: campaigns, error: campaignError } = await adminClient
    .from('post_program_survey_campaign')
    .select('id, semester_id, completed_at')
    .is('completed_at', null)
    .lte('available_at', now)

  if (campaignError) throw new Error(campaignError.message)
  if (!campaigns?.length) return 0

  const members = [] as { campaign_id: string; profile_id: string }[]
  for (const ids of chunk(campaigns.map(campaign => campaign.id))) {
    const { data, error } = await adminClient
      .from('post_program_survey_campaign_member')
      .select('campaign_id, profile_id')
      .in('campaign_id', ids)
    if (error) throw new Error(error.message)
    members.push(...(data ?? []))
  }
  const profileIds = Array.from(new Set((members ?? []).map(member => member.profile_id)))
  if (!profileIds.length) return 0

  const profiles = [] as { id: string; role: string | null; email: string | null }[]
  for (const ids of chunk(profileIds)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, role, email')
      .in('id', ids)
    if (error) throw new Error(error.message)
    profiles.push(...(data ?? []))
  }
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
      POST_PROGRAM_SURVEY_SCHEDULE.map(slot => ({
        campaign_id: campaign.id,
        template_key: slot.templateKey,
        slot_at: slot.at,
        recipient_email: recipientEmail,
        due_at: slot.at,
      }))
    )
  )

  if (!eventRows.length) return 0
  let created = 0
  for (const rows of chunk(eventRows)) {
    const { data, error } = await adminClient
      .from('post_program_survey_email_event')
      .upsert(rows, { onConflict: 'campaign_id,template_key,slot_at,recipient_email', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(error.message)
    created += data?.length ?? 0
  }
  void appOrigin
  return created
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
  const campaigns = [] as { id: string; semester_id: string; completed_at: string | null }[]
  for (const ids of chunk(campaignIds)) {
    const { data, error } = await adminClient
      .from('post_program_survey_campaign')
      .select('id, semester_id, completed_at')
      .in('id', ids)
    if (error) throw new Error(error.message)
    campaigns.push(...(data ?? []))
  }
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
  const startedAt = Date.now()
  const errors: string[] = []
  let campaignsEnsured = 0
  let eventsCreated = 0
  let sent = { eventsClaimed: 0, emailsSent: 0, emailsSkipped: 0, emailFailures: 0, errors: [] as string[] }
  let campaignRowsScanned = 0
  let skipped = false

  const { data: acquired, error: leaseError } = await adminClient.rpc('try_acquire_post_program_survey_runner_lease', {
    p_job_key: RUNNER_JOB_KEY,
    p_owner_run_id: runId,
    p_now: new Date().toISOString(),
    p_lease_seconds: RUNNER_LEASE_SECONDS,
  })
  if (leaseError) throw new Error(leaseError.message)
  if (!acquired) {
    return { runId, campaignsEnsured: 0, eventsCreated: 0, ...sent, campaignRowsScanned: 0, durationMs: Date.now() - startedAt, skipped: true, errors: ['runner lease held'] }
  }

  try {
    const { data: state, error: stateError } = await adminClient
      .from('post_program_survey_runner_state')
      .select('last_enrollment_id')
      .eq('job_key', RUNNER_JOB_KEY)
      .maybeSingle()
    if (stateError) throw new Error(stateError.message)

    const result = await ensureCampaigns(new Date().toISOString(), state?.last_enrollment_id ?? null)
    campaignsEnsured = result.campaignsEnsured
    campaignRowsScanned = result.rowsScanned
    const { error } = await adminClient.from('post_program_survey_runner_state').upsert({
      job_key: RUNNER_JOB_KEY,
      last_enrollment_id: result.lastEnrollmentId,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
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

  try {
    await adminClient.rpc('release_post_program_survey_runner_lease', {
      p_job_key: RUNNER_JOB_KEY,
      p_owner_run_id: runId,
    })
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Lease release failed')
  }

  return { runId, campaignsEnsured, eventsCreated, ...sent, campaignRowsScanned, durationMs: Date.now() - startedAt, skipped, errors: [...errors, ...sent.errors] }
}
