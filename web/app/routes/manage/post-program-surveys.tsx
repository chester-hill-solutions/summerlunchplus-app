import { Form, redirect, useActionData, useLoaderData, useNavigation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/post-program-surveys'

type ActionData = { error?: string; success?: string }

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString() : '-')
const groupByCampaign = <T extends { campaign_id: string }>(rows: T[]) =>
  rows.reduce<Record<string, T[]>>((groups, row) => {
    ;(groups[row.campaign_id] ??= []).push(row)
    return groups
  }, {})

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'manager')) {
    throw redirect('/manage', { headers: auth.headers })
  }

  const { data: campaigns, error } = await adminClient
    .from('post_program_survey_campaign')
    .select('id, semester_id, survey_profile_id, available_at, completed_at, completed_submission_id, manually_completed_at, manual_completion_reason, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Response(error.message, { status: 500, headers: auth.headers })

  const campaignIds = (campaigns ?? []).map(campaign => campaign.id)
  const [membersResult, enrollmentsResult, eventsResult, auditResult] = await Promise.all([
    campaignIds.length
      ? adminClient.from('post_program_survey_campaign_member').select('campaign_id, profile_id').in('campaign_id', campaignIds)
      : Promise.resolve({ data: [] as Array<{ campaign_id: string; profile_id: string }> }),
    campaignIds.length
      ? adminClient.from('post_program_survey_campaign_enrollment').select('campaign_id, workshop_enrollment_id').in('campaign_id', campaignIds)
      : Promise.resolve({ data: [] as Array<{ campaign_id: string; workshop_enrollment_id: string }> }),
    campaignIds.length
      ? adminClient.from('post_program_survey_email_event').select('campaign_id, template_key, slot_at, recipient_email, sent_at, last_error').in('campaign_id', campaignIds)
      : Promise.resolve({ data: [] as Array<{ campaign_id: string; template_key: string; slot_at: string; recipient_email: string; sent_at: string | null; last_error: string | null }> }),
    campaignIds.length
      ? adminClient.from('post_program_survey_campaign_audit').select('campaign_id, event_type, source, created_at').in('campaign_id', campaignIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ campaign_id: string; event_type: string; source: string; created_at: string }> }),
  ])

  const members = (membersResult.data ?? []) as Array<{ campaign_id: string; profile_id: string }>
  const enrollments = (enrollmentsResult.data ?? []) as Array<{ campaign_id: string; workshop_enrollment_id: string }>
  const events = (eventsResult.data ?? []) as Array<{ campaign_id: string; template_key: string; slot_at: string; recipient_email: string; sent_at: string | null; last_error: string | null }>
  const audits = (auditResult.data ?? []) as Array<{ campaign_id: string; event_type: string; source: string; created_at: string }>

  return {
    campaigns: campaigns ?? [],
    membersByCampaign: groupByCampaign(members),
    enrollmentsByCampaign: groupByCampaign(enrollments),
    eventsByCampaign: groupByCampaign(events),
    auditByCampaign: groupByCampaign(audits),
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'manager')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const campaignId = String(formData.get('campaign_id') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()
  if (!campaignId || !reason) return { error: 'Campaign and completion reason are required.' } satisfies ActionData

  const { supabase } = createClient(request)
  const { error } = await supabase.rpc('manually_complete_post_program_survey_campaign', {
    p_campaign_id: campaignId,
    p_reason: reason,
  })
  if (error) return { error: error.message } satisfies ActionData
  return { success: 'Campaign marked complete with an audit record.' } satisfies ActionData
}

export default function PostProgramSurveysPage() {
  const { campaigns, membersByCampaign, enrollmentsByCampaign, eventsByCampaign, auditByCampaign } = useLoaderData<typeof loader>()
  const actionData = useActionData<ActionData>()
  const navigation = useNavigation()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Post-program survey campaigns</CardTitle>
          <CardDescription>Campaign state, scheduled messages, and final-card survey holds. Survey answers are not shown here.</CardDescription>
        </CardHeader>
        <CardContent>
          {actionData?.error ? <p className="mb-3 text-sm text-destructive">{actionData.error}</p> : null}
          {actionData?.success ? <p className="mb-3 text-sm text-emerald-700">{actionData.success}</p> : null}
          {campaigns.length === 0 ? <p className="text-sm text-muted-foreground">No campaigns found.</p> : (
            <div className="space-y-4">
              {campaigns.map(campaign => {
                const events = eventsByCampaign[campaign.id] ?? []
                const audits = auditByCampaign[campaign.id] ?? []
                return (
                  <section key={campaign.id} className="rounded-md border p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">Campaign {campaign.id}</p>
                        <p className="text-xs text-muted-foreground">Semester {campaign.semester_id}</p>
                      </div>
                      <span className={campaign.completed_at ? 'text-sm text-emerald-700' : 'text-sm text-amber-700'}>
                        {campaign.completed_at ? `Completed ${formatDateTime(campaign.completed_at)}` : 'Incomplete'}
                      </span>
                    </div>
                    <div className="grid gap-2 text-sm md:grid-cols-3">
                      <p>Available: {formatDateTime(campaign.available_at)}</p>
                      <p>Members: {(membersByCampaign[campaign.id] ?? []).length}</p>
                      <p>Accepted enrollments: {(enrollmentsByCampaign[campaign.id] ?? []).length}</p>
                    </div>
                    <p className="text-sm">Messages: {events.length}, sent: {events.filter(event => event.sent_at).length}, failures: {events.filter(event => event.last_error).length}</p>
                    <p className="text-xs text-muted-foreground">Latest audit: {audits[0] ? `${audits[0].event_type} (${audits[0].source}) at ${formatDateTime(audits[0].created_at)}` : '-'}</p>
                    {!campaign.completed_at ? (
                      <Form method="post" className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="campaign_id" value={campaign.id} />
                        <div className="grid gap-1 min-w-72">
                          <Label htmlFor={`reason-${campaign.id}`}>Manual completion reason</Label>
                          <Input id={`reason-${campaign.id}`} name="reason" required />
                        </div>
                        <Button type="submit" variant="outline" disabled={navigation.state !== 'idle'}>Mark complete</Button>
                      </Form>
                    ) : campaign.manual_completion_reason ? <p className="text-sm text-muted-foreground">Manual reason: {campaign.manual_completion_reason}</p> : null}
                  </section>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
