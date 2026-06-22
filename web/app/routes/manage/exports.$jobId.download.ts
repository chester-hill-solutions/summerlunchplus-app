import { redirect } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { createExportDownloadSignedUrl, getExportJobById } from '@/lib/exports/repository.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/exports.$jobId.download'

export async function action({ request, params }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const jobId = params.jobId
  if (!jobId) {
    return new Response('Missing export job id', { status: 400, headers: auth.headers })
  }

  const { supabase } = createClient(request)
  const job = await getExportJobById({ supabase, jobId })

  if (job.status !== 'completed' || !job.storage_bucket || !job.storage_path) {
    return new Response('Export file is not available yet', { status: 409, headers: auth.headers })
  }

  const signedUrl = await createExportDownloadSignedUrl({
    bucket: job.storage_bucket,
    path: job.storage_path,
    expiresIn: 600,
  })

  throw redirect(signedUrl, { headers: auth.headers })
}
