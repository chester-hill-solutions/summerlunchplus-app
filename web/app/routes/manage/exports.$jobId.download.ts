import { createActionProfile } from '@/lib/action-profile.server'
import { requireAuth } from '@/lib/auth.server'
import { createExportDownloadSignedUrl, getExportJobById } from '@/lib/exports/repository.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/exports.$jobId.download'

export async function action({ request, params }: Route.ActionArgs) {
  const profile = createActionProfile({
    name: 'manage_exports_download_action',
    request,
  })
  let outcome = 'unknown'
  let errorMessage: string | null = null

  try {
    const auth = await requireAuth(request)
    profile.mark('require_auth', {
      role: auth.claims.role,
    })
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      outcome = 'unauthorized'
      return Response.json({ error: 'Unauthorized' }, { status: 403, headers: auth.headers })
    }

    const jobId = params.jobId
    if (!jobId) {
      outcome = 'missing_job_id'
      return Response.json({ error: 'Missing export job id' }, { status: 400, headers: auth.headers })
    }

    const { supabase } = createClient(request)
    const job = await getExportJobById({ supabase, jobId })
    profile.mark('load_export_job', {
      jobId,
      status: job.status,
    })

    if (job.status !== 'completed' || !job.storage_bucket || !job.storage_path) {
      outcome = 'file_unavailable'
      return Response.json({ error: 'Export file is not available yet' }, { status: 409, headers: auth.headers })
    }

    const signedUrl = await createExportDownloadSignedUrl({
      bucket: job.storage_bucket,
      path: job.storage_path,
      expiresIn: 600,
    })
    profile.mark('create_signed_url', {
      jobId,
      bucket: job.storage_bucket,
    })

    outcome = 'success'
    return Response.json(
      {
        signedUrl,
        message: 'Export download started.',
      },
      { headers: auth.headers }
    )
  } catch (error) {
    outcome = 'exception'
    errorMessage = error instanceof Error ? error.message : String(error)
    profile.log('manage_exports_download_action_error', {
      outcome,
      error: errorMessage,
    })
    throw error
  } finally {
    profile.complete({
      outcome,
      error: errorMessage,
    })
  }
}
