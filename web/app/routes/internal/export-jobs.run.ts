import { processNextExportJob } from '@/lib/exports/runner.server'
import { cleanupExpiredExports } from '@/lib/exports/cleanup.server'
import { failStaleRunningJobs } from '@/lib/exports/repository.server'
import { validateInternalRunnerRequest } from '@/lib/internal-runner-auth.server'

import type { ActionFunctionArgs } from 'react-router'

const unauthorized = () => new Response('Unauthorized', { status: 401 })

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const authCheck = validateInternalRunnerRequest(request, {
    specificEnvVar: 'EXPORT_RUNNER_SECRET',
    specificHeader: 'x-export-runner-secret',
  })

  if (!authCheck.ok) {
    return unauthorized()
  }

  await failStaleRunningJobs({ olderThanMinutes: 30 })
  await cleanupExpiredExports()

  const result = await processNextExportJob()
  return Response.json({ runId: authCheck.runId, ...result })
}
