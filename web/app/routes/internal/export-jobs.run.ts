import { processNextExportJob } from '@/lib/exports/runner.server'
import { cleanupExpiredExports } from '@/lib/exports/cleanup.server'
import { failStaleRunningJobs } from '@/lib/exports/repository.server'

import type { ActionFunctionArgs } from 'react-router'

const unauthorized = () => new Response('Unauthorized', { status: 401 })

const hasValidSecret = (request: Request) => {
  const configured = process.env.EXPORT_RUNNER_SECRET
  if (!configured) return false
  const provided = request.headers.get('x-export-runner-secret')
  return Boolean(provided && provided === configured)
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  if (!hasValidSecret(request)) {
    return unauthorized()
  }

  await failStaleRunningJobs({ olderThanMinutes: 30 })
  await cleanupExpiredExports()

  const result = await processNextExportJob()
  return Response.json(result)
}
