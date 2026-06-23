import { useEffect } from 'react'
import { Form, redirect, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { triggerExportRunner } from '@/lib/exports/dispatch.server'
import { processExportJobById } from '@/lib/exports/runner.server'
import {
  createExportJob,
  getExportJobById,
  insertExportJobRows,
  listExportJobs,
  setExportJobStatus,
} from '@/lib/exports/repository.server'
import { buildWorkshopEnrollmentSnapshot } from '@/lib/exports/workshop-enrollment-snapshot.server'
import { EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV } from '@/lib/exports/types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/exports'

type ActionData = {
  error?: string
  success?: string
  warning?: string
}

const isActiveStatus = (status: string) => status === 'queued' || status === 'running'

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
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw redirect('/manage', { headers: auth.headers })
  }

  const { supabase } = createClient(request)
  const jobs = await listExportJobs({ supabase })

  return {
    jobs,
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const { supabase } = createClient(request)
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')

  if (intent === 'create-export') {
    const exportType = String(formData.get('export_type') ?? '')
    const sourcePath = String(formData.get('source_path') ?? '').trim()

    if (exportType !== EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV) {
      return { error: 'Unsupported export type.' } satisfies ActionData
    }

    if (!sourcePath.startsWith('/manage/workshop-enrollment')) {
      return { error: 'Invalid export source path.' } satisfies ActionData
    }

    const sourceUrl = new URL(sourcePath, request.url)
    const sourceRequest = new Request(sourceUrl.toString(), {
      method: 'GET',
      headers: request.headers,
    })

    const snapshot = await buildWorkshopEnrollmentSnapshot({ request: sourceRequest })
    const job = await createExportJob({
      supabase,
      requestedBy: auth.user.id,
      exportType,
      sourceTable: 'workshop_enrollment',
      queryParams: snapshot.queryParams,
      filters: snapshot.filters,
      sort: snapshot.sort,
      columnOrder: snapshot.columns,
    })

    await insertExportJobRows({
      supabase,
      jobId: job.id,
      rows: snapshot.rows,
    })

    const triggerOutcome = await triggerExportRunnerWithFallback({ request, jobId: job.id })
    if (triggerOutcome.warning) {
      return {
        success: `Export queued (${snapshot.rows.length} rows).`,
        warning: triggerOutcome.warning,
      } satisfies ActionData
    }

    return { success: `Export queued (${snapshot.rows.length} rows).` } satisfies ActionData
  }

  if (intent === 'retry-export') {
    const jobId = String(formData.get('job_id') ?? '')
    if (!jobId) return { error: 'Missing export job id.' } satisfies ActionData
    const job = await getExportJobById({ supabase, jobId })
    if (job.status !== 'failed') {
      return { error: 'Only failed exports can be retried.' } satisfies ActionData
    }

    await setExportJobStatus({ supabase, jobId, status: 'queued' })
    const triggerOutcome = await triggerExportRunnerWithFallback({ request, jobId })
    if (triggerOutcome.warning) {
      return { success: 'Export re-queued.', warning: triggerOutcome.warning } satisfies ActionData
    }
    return { success: 'Export re-queued.' } satisfies ActionData
  }

  if (intent === 'cancel-export') {
    const jobId = String(formData.get('job_id') ?? '')
    if (!jobId) return { error: 'Missing export job id.' } satisfies ActionData
    const job = await getExportJobById({ supabase, jobId })
    if (!isActiveStatus(job.status)) {
      return { error: 'Only queued or running exports can be cancelled.' } satisfies ActionData
    }
    await setExportJobStatus({ supabase, jobId, status: 'cancelled' })
    return { success: 'Export cancelled.' } satisfies ActionData
  }

  return { error: 'Unsupported action.' } satisfies ActionData
}

export default function ManageExportsPage() {
  const { jobs } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const revalidator = useRevalidator()
  const isSubmitting = navigation.state === 'submitting'
  const hasActiveJobs = jobs.some(job => isActiveStatus(job.status))

  useEffect(() => {
    if (!hasActiveJobs) return
    const timer = window.setInterval(() => {
      revalidator.revalidate()
    }, 5000)

    return () => {
      window.clearInterval(timer)
    }
  }, [hasActiveJobs, revalidator])

  return (
    <div className="space-y-4">
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
                <td className="px-3 py-2">{new Date(job.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono text-xs">{job.export_type}</td>
                <td className="px-3 py-2 font-mono text-xs">{job.requested_by}</td>
                <td className="px-3 py-2">{job.status}</td>
                <td className="px-3 py-2">{job.row_count ?? '-'}</td>
                <td className="px-3 py-2">{job.file_size_bytes ?? '-'}</td>
                <td className="px-3 py-2">{job.completed_at ? new Date(job.completed_at).toLocaleString() : '-'}</td>
                <td className="px-3 py-2">{job.expires_at ? new Date(job.expires_at).toLocaleString() : '-'}</td>
                <td className="px-3 py-2 text-xs text-destructive">{job.error_message ?? '-'}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {job.status === 'completed' ? (
                      <Form method="post" action={`/manage/exports/${job.id}/download`}>
                        <Button type="submit" size="sm" variant="outline" disabled={isSubmitting}>
                          Download
                        </Button>
                      </Form>
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
