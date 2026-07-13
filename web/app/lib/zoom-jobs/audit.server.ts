import { adminClient } from '@/lib/supabase/adminClient'

type AttemptStatus = 'started' | 'succeeded' | 'failed' | 'skipped'
type TriggerSource = 'scheduler' | 'internal' | 'ui' | 'manual' | 'unknown'

type TriggerKind =
  | 'zoom_jobs_run'
  | 'zoom_jobs_class'
  | 'zoom_jobs_registrant'
  | 'generate_meeting_button'
  | 'register_button'
  | 'sync_button'
  | 'scheduler_cron'
  | 'unknown'

type JsonRecord = Record<string, unknown>

export type ZoomAuditContext = {
  runId: string
  runDbId?: string | null
  triggerSource: TriggerSource
  triggerKind: TriggerKind
  actorUserId?: string | null
  actorRole?: string | null
}

type RunStartInput = {
  runId: string
  triggerSource: TriggerSource
  triggerKind: TriggerKind
  actorUserId?: string | null
  actorRole?: string | null
  context?: JsonRecord
}

type RunFinishInput = {
  id: string
  status: Exclude<AttemptStatus, 'started'>
  summary?: JsonRecord
  errorMessage?: string | null
}

type AttemptStartInput = {
  runDbId?: string | null
  runId: string
  actionType: string
  triggerSource: TriggerSource
  triggerKind: TriggerKind
  classId?: string | null
  profileId?: string | null
  classZoomMeetingId?: string | null
  classZoomRegistrantId?: string | null
  requestPayload?: JsonRecord
  externalRequestPayload?: JsonRecord
}

type AttemptFinishInput = {
  id: string
  status: Exclude<AttemptStatus, 'started'>
  resultPayload?: JsonRecord
  errorPayload?: JsonRecord
  externalResponsePayload?: JsonRecord
  errorMessage?: string | null
}

const nowIso = () => new Date().toISOString()

const nonEmpty = (value: string | null | undefined) => {
  const next = (value ?? '').trim()
  return next ? next : null
}

export const startZoomJobRunAudit = async (input: RunStartInput) => {
  const { data, error } = await adminClient
    .from('zoom_job_run')
    .insert({
      run_id: input.runId,
      trigger_source: input.triggerSource,
      trigger_kind: input.triggerKind,
      actor_user_id: nonEmpty(input.actorUserId ?? null),
      actor_role: nonEmpty(input.actorRole ?? null),
      context: input.context ?? {},
      status: 'started',
      started_at: nowIso(),
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !data?.id) {
    console.error('[zoom-audit] failed to create zoom_job_run', { error: error?.message ?? 'unknown' })
    return null
  }

  return data.id
}

export const finishZoomJobRunAudit = async (input: RunFinishInput) => {
  if (!input.id) return
  const { error } = await adminClient
    .from('zoom_job_run')
    .update({
      status: input.status,
      summary: input.summary ?? {},
      error_message: input.errorMessage ?? null,
      completed_at: nowIso(),
    })
    .eq('id', input.id)

  if (error) {
    console.error('[zoom-audit] failed to update zoom_job_run', { id: input.id, error: error.message })
  }
}

export const startZoomJobAttemptAudit = async (input: AttemptStartInput) => {
  const startedAt = Date.now()
  const { data, error } = await adminClient
    .from('zoom_job_attempt')
    .insert({
      zoom_job_run_id: input.runDbId ?? null,
      run_id: input.runId,
      action_type: input.actionType,
      trigger_source: input.triggerSource,
      trigger_kind: input.triggerKind,
      class_id: nonEmpty(input.classId ?? null),
      profile_id: nonEmpty(input.profileId ?? null),
      class_zoom_meeting_id: nonEmpty(input.classZoomMeetingId ?? null),
      class_zoom_registrant_id: nonEmpty(input.classZoomRegistrantId ?? null),
      request_payload: input.requestPayload ?? {},
      external_request_payload: input.externalRequestPayload ?? {},
      status: 'started',
      started_at: nowIso(),
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !data?.id) {
    console.error('[zoom-audit] failed to create zoom_job_attempt', {
      actionType: input.actionType,
      error: error?.message ?? 'unknown',
    })
    return null
  }

  return { id: data.id, startedAt }
}

export const finishZoomJobAttemptAudit = async (
  start: { id: string; startedAt: number } | null,
  input: AttemptFinishInput
) => {
  if (!start || !input.id) return
  const { error } = await adminClient
    .from('zoom_job_attempt')
    .update({
      status: input.status,
      result_payload: input.resultPayload ?? {},
      error_payload: input.errorPayload ?? {},
      external_response_payload: input.externalResponsePayload ?? {},
      error_message: input.errorMessage ?? null,
      completed_at: nowIso(),
      duration_ms: Math.max(0, Date.now() - start.startedAt),
    })
    .eq('id', start.id)

  if (error) {
    console.error('[zoom-audit] failed to update zoom_job_attempt', { id: start.id, error: error.message })
  }
}

export const appendZoomJobAttemptEvent = async ({
  attemptId,
  eventType,
  status = 'info',
  payload,
}: {
  attemptId: string
  eventType: string
  status?: 'info' | 'warning' | 'error'
  payload?: JsonRecord
}) => {
  const { error } = await adminClient.from('zoom_job_attempt_event').insert({
    zoom_job_attempt_id: attemptId,
    event_type: eventType,
    status,
    payload: payload ?? {},
  })

  if (error) {
    console.error('[zoom-audit] failed to append zoom_job_attempt_event', {
      attemptId,
      eventType,
      error: error.message,
    })
  }
}
