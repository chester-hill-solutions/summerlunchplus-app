import { useEffect, useState } from 'react'
import { Form, redirect, useActionData, useFetcher, useLoaderData, useNavigation, useRevalidator } from 'react-router'

import { Button } from '@/components/ui/button'
import { createActionProfile } from '@/lib/action-profile.server'
import { requireAuth } from '@/lib/auth.server'
import { createLoaderProfile } from '@/lib/loader-profile.server'
import { triggerExportRunner } from '@/lib/exports/dispatch.server'
import { buildClassAttendanceSnapshot } from '@/lib/exports/class-attendance-snapshot.server'
import { buildEmailMessageSnapshot } from '@/lib/exports/email-message-snapshot.server'
import { buildFederalElectoralDistrictSnapshot } from '@/lib/exports/federal-electoral-district-snapshot.server'
import { buildFormAnswerSnapshot } from '@/lib/exports/form-answer-snapshot.server'
import { processExportJobById } from '@/lib/exports/runner.server'
import {
  createExportJob,
  getExportJobById,
  insertExportJobRows,
  listExportJobs,
  setExportJobStatus,
} from '@/lib/exports/repository.server'
import { buildWorkshopEnrollmentSnapshot } from '@/lib/exports/workshop-enrollment-snapshot.server'
import {
  EXPORT_TYPE_CLASS_ATTENDANCE_CSV,
  EXPORT_TYPE_EMAIL_MESSAGE_CSV,
  EXPORT_TYPE_FEDERAL_ELECTORAL_DISTRICT_CSV,
  EXPORT_TYPE_FORM_ANSWER_CSV,
  EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV,
} from '@/lib/exports/types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/exports'

type ActionData = {
  error?: string
  success?: string
  warning?: string
}

type DownloadActionData = {
  signedUrl?: string
  message?: string
  error?: string
}

type ToastState = {
  tone: 'success' | 'error'
  message: string
} | null

const isActiveStatus = (status: string) => status === 'queued' || status === 'running'
const EXPORTS_DISPLAY_LOCALE = 'en-US'
const EXPORTS_DISPLAY_TIME_ZONE = 'UTC'

const formatExportDateTime = (value: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(EXPORTS_DISPLAY_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: EXPORTS_DISPLAY_TIME_ZONE,
  }).format(date)
}

const toActionErrorMessage = async (error: unknown) => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const preferred = [
      record.message,
      record.error,
      record.error_description,
      record.details,
      record.hint,
      record.code,
    ].find(value => typeof value === 'string' && value.trim())
    if (typeof preferred === 'string') return preferred
  }
  if (error instanceof Response) {
    try {
      const text = (await error.text()).trim()
      return text || `Request failed (${error.status})`
    } catch {
      return `Request failed (${error.status})`
    }
  }
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unable to queue export.'
  }
}

const EXPORT_CONFIG = {
  [EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV]: {
    sourcePathname: '/manage/workshop-enrollment',
    sourceTable: 'workshop_enrollment',
    buildSnapshot: buildWorkshopEnrollmentSnapshot,
  },
  [EXPORT_TYPE_FEDERAL_ELECTORAL_DISTRICT_CSV]: {
    sourcePathname: '/manage/federal-electoral-district',
    sourceTable: 'federal_electoral_district',
    buildSnapshot: buildFederalElectoralDistrictSnapshot,
  },
  [EXPORT_TYPE_EMAIL_MESSAGE_CSV]: {
    sourcePathname: '/manage/email-message',
    sourceTable: 'email_message',
    buildSnapshot: buildEmailMessageSnapshot,
  },
  [EXPORT_TYPE_CLASS_ATTENDANCE_CSV]: {
    sourcePathname: '/manage/class-attendance',
    sourceTable: 'class_attendance',
    buildSnapshot: buildClassAttendanceSnapshot,
  },
  [EXPORT_TYPE_FORM_ANSWER_CSV]: {
    sourcePathname: '/manage/form-answer',
    sourceTable: 'form_answer',
    buildSnapshot: buildFormAnswerSnapshot,
  },
} as const

const triggerExportRunnerWithFallback = async ({ request, jobId }: { request: Request; jobId: string }) => {
  const triggerResult = await triggerExportRunner({ request })
  if (triggerResult.ok) {
    return { warning: undefined as string | undefined }
  }

  const fallbackResult = await processExportJobById({ jobId })
  if (fallbackResult.processed && fallbackResult.jobId === jobId) {
    console.warn('[exports] immediate trigger failed, local fallback processed queued job', {
      jobId,
      triggerResult,
    })
    return { warning: undefined as string | undefined }
  }

  const warning =
    triggerResult.reason === 'missing-secret'
      ? 'Export queued, but immediate processing is disabled because EXPORT_RUNNER_SECRET is not configured. Configure the secret and scheduler, or run /internal/export-jobs/run manually.'
      : `Export queued, but immediate processing trigger failed${typeof triggerResult.status === 'number' ? ` (HTTP ${triggerResult.status})` : ''}${triggerResult.body ? `: ${triggerResult.body}` : ''}. The scheduler can still pick this up.`

  console.error('[exports] immediate process trigger failed', {
    jobId,
    triggerResult,
    fallbackResult,
  })
  return { warning }
}

export async function loader({ request }: Route.LoaderArgs) {
  const profile = createLoaderProfile({
    name: 'manage_exports_loader',
    request,
  })
  const auth = await requireAuth(request)
  profile.mark('require_auth', {
    role: auth.claims.role,
  })
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw redirect('/manage', { headers: auth.headers })
  }

  const { supabase } = createClient(request)
  const jobs = await listExportJobs({ supabase })
  profile.mark('list_export_jobs', {
    jobCount: jobs.length,
  })

  profile.complete({
    jobCount: jobs.length,
  })

  return {
    jobs,
  }
}

export async function action({ request }: Route.ActionArgs) {
  const profile = createActionProfile({
    name: 'manage_exports_action',
    request,
  })
  let intent: string | null = null
  let outcome = 'unknown'
  let errorMessage: string | null = null

  try {
    const auth = await requireAuth(request)
    profile.mark('require_auth', {
      role: auth.claims.role,
    })
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      outcome = 'unauthorized'
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    const { supabase } = createClient(request)
    const formData = await request.formData()
    intent = String(formData.get('intent') ?? '')
    profile.mark('parse_form_data', {
      intent,
    })

  if (intent === 'create-export') {
    const exportType = String(formData.get('export_type') ?? '')
    const sourcePath = String(formData.get('source_path') ?? '').trim()
    const exportConfig = EXPORT_CONFIG[exportType as keyof typeof EXPORT_CONFIG]

    if (!exportConfig) {
      return { error: 'Unsupported export type.' } satisfies ActionData
    }

    const sourceUrl = new URL(sourcePath, request.url)
    if (sourceUrl.pathname !== exportConfig.sourcePathname) {
      return { error: 'Invalid export source path.' } satisfies ActionData
    }
    const sourceRequest = new Request(sourceUrl.toString(), {
      method: 'GET',
      headers: request.headers,
    })

    try {
      const snapshot = await exportConfig.buildSnapshot({ request: sourceRequest })
      profile.mark('create_export_build_snapshot', {
        exportType,
        sourcePath,
        rowCount: snapshot.rows.length,
        columnCount: snapshot.columns.length,
      })
      const job = await createExportJob({
        supabase,
        requestedBy: auth.user.id,
        exportType,
        sourceTable: exportConfig.sourceTable,
        queryParams: snapshot.queryParams,
        filters: snapshot.filters,
        sort: snapshot.sort,
        columnOrder: snapshot.columns,
      })
      profile.mark('create_export_create_job', {
        jobId: job.id,
        exportType,
      })

      await insertExportJobRows({
        supabase,
        jobId: job.id,
        rows: snapshot.rows,
      })
      profile.mark('create_export_insert_rows', {
        jobId: job.id,
        rowCount: snapshot.rows.length,
      })

      const triggerOutcome = await triggerExportRunnerWithFallback({ request, jobId: job.id })
      profile.mark('create_export_trigger_runner', {
        jobId: job.id,
        warning: triggerOutcome.warning ?? null,
      })
      if (triggerOutcome.warning) {
        outcome = 'create_export_queued_with_warning'
        return {
          success: `Export queued (${snapshot.rows.length} rows).`,
          warning: triggerOutcome.warning,
        } satisfies ActionData
      }

      outcome = 'create_export_success'
      return { success: `Export queued (${snapshot.rows.length} rows).` } satisfies ActionData
    } catch (error) {
      outcome = 'create_export_error'
      errorMessage = await toActionErrorMessage(error)
      profile.log('create_export_failed', {
        exportType,
        sourcePath,
        error: errorMessage,
      })
      return {
        error: errorMessage,
      } satisfies ActionData
    }
  }

  if (intent === 'retry-export') {
    const jobId = String(formData.get('job_id') ?? '')
    if (!jobId) return { error: 'Missing export job id.' } satisfies ActionData
    const job = await getExportJobById({ supabase, jobId })
    profile.mark('retry_export_load_job', {
      jobId,
      status: job.status,
    })
    if (job.status !== 'failed') {
      return { error: 'Only failed exports can be retried.' } satisfies ActionData
    }

    await setExportJobStatus({ supabase, jobId, status: 'queued' })
    profile.mark('retry_export_queue_job', { jobId })
    const triggerOutcome = await triggerExportRunnerWithFallback({ request, jobId })
    profile.mark('retry_export_trigger_runner', {
      jobId,
      warning: triggerOutcome.warning ?? null,
    })
    if (triggerOutcome.warning) {
      outcome = 'retry_queued_with_warning'
      return { success: 'Export re-queued.', warning: triggerOutcome.warning } satisfies ActionData
    }
    outcome = 'retry_success'
    return { success: 'Export re-queued.' } satisfies ActionData
  }

  if (intent === 'cancel-export') {
    const jobId = String(formData.get('job_id') ?? '')
    if (!jobId) return { error: 'Missing export job id.' } satisfies ActionData
    const job = await getExportJobById({ supabase, jobId })
    profile.mark('cancel_export_load_job', {
      jobId,
      status: job.status,
    })
    if (!isActiveStatus(job.status)) {
      return { error: 'Only queued or running exports can be cancelled.' } satisfies ActionData
    }
    await setExportJobStatus({ supabase, jobId, status: 'cancelled' })
    profile.mark('cancel_export_set_status', { jobId })
    outcome = 'cancel_success'
    return { success: 'Export cancelled.' } satisfies ActionData
  }

  outcome = 'unsupported_action'
  return { error: 'Unsupported action.' } satisfies ActionData
  } catch (error) {
    outcome = 'exception'
    errorMessage = error instanceof Error ? error.message : String(error)
    profile.log('manage_exports_action_error', {
      intent,
      outcome,
      error: errorMessage,
    })
    throw error
  } finally {
    profile.complete({
      intent,
      outcome,
      error: errorMessage,
    })
  }
}

export default function ManageExportsPage() {
  const { jobs } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const revalidator = useRevalidator()
  const downloadFetcher = useFetcher<DownloadActionData>()
  const isSubmitting = navigation.state === 'submitting'
  const hasActiveJobs = jobs.some(job => isActiveStatus(job.status))
  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    if (!hasActiveJobs) return
    const timer = window.setInterval(() => {
      revalidator.revalidate()
    }, 5000)

    return () => {
      window.clearInterval(timer)
    }
  }, [hasActiveJobs, revalidator])

  useEffect(() => {
    if (!downloadFetcher.data) return

    if (downloadFetcher.data.signedUrl) {
      window.open(downloadFetcher.data.signedUrl, '_blank', 'noopener,noreferrer')
      setToast({
        tone: 'success',
        message: downloadFetcher.data.message ?? 'Export download started.',
      })
      return
    }

    if (downloadFetcher.data.error) {
      setToast({ tone: 'error', message: downloadFetcher.data.error })
    }
  }, [downloadFetcher.data])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <div className="space-y-4">
      {toast ? (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded border px-3 py-2 text-sm shadow-md ${
            toast.tone === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <section className="rounded-lg border bg-card p-4">
        <h1 className="text-xl font-semibold">Exports</h1>
        <p className="text-sm text-muted-foreground">
          Track asynchronous exports and download completed files.
        </p>
      </section>

      {actionData?.error ? (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionData.error}
        </p>
      ) : null}
      {actionData?.success ? (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {actionData.success}
        </p>
      ) : null}
      {actionData?.warning ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {actionData.warning}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Requested by</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Rows</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2">Completed</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2">Error</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id} className="border-t align-top">
                <td className="px-3 py-2">{formatExportDateTime(job.created_at)}</td>
                <td className="px-3 py-2 font-mono text-xs">{job.export_type}</td>
                <td className="px-3 py-2 font-mono text-xs">{job.requested_by}</td>
                <td className="px-3 py-2">{job.status}</td>
                <td className="px-3 py-2">{job.row_count ?? '-'}</td>
                <td className="px-3 py-2">{job.file_size_bytes ?? '-'}</td>
                <td className="px-3 py-2">{formatExportDateTime(job.completed_at)}</td>
                <td className="px-3 py-2">{formatExportDateTime(job.expires_at)}</td>
                <td className="px-3 py-2 text-xs text-destructive">{job.error_message ?? '-'}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {job.status === 'completed' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={downloadFetcher.state === 'submitting'}
                        onClick={() => {
                          setToast({ tone: 'success', message: 'Preparing export download...' })
                          downloadFetcher.submit(
                            {},
                            {
                              method: 'post',
                              action: `/manage/exports/${job.id}/download`,
                            }
                          )
                        }}
                      >
                        Download
                      </Button>
                    ) : null}
                    {job.status === 'failed' ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="retry-export" />
                        <input type="hidden" name="job_id" value={job.id} />
                        <Button type="submit" size="sm" variant="outline" disabled={isSubmitting}>
                          Retry
                        </Button>
                      </Form>
                    ) : null}
                    {(job.status === 'queued' || job.status === 'running') ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="cancel-export" />
                        <input type="hidden" name="job_id" value={job.id} />
                        <Button type="submit" size="sm" variant="outline" disabled={isSubmitting}>
                          Cancel
                        </Button>
                      </Form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!jobs.length ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                  No export jobs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
