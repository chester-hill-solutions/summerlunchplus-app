import type { ActionFunctionArgs } from 'react-router'

import { validateInternalRunnerRequest } from '@/lib/internal-runner-auth.server'
import { runZoomJobs } from '@/lib/zoom-jobs/runner.server'

const unauthorized = () => new Response('Unauthorized', { status: 401 })

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authCheck = validateInternalRunnerRequest(request, {
    specificEnvVar: 'ZOOM_RUNNER_SECRET',
    specificHeader: 'x-zoom-runner-secret',
  })

  if (!authCheck.ok) {
    return unauthorized()
  }

  const appOrigin = new URL(request.url).origin
  console.info('[internal][zoom-jobs.run] starting', { runId: authCheck.runId })
  const result = await runZoomJobs({ appOrigin })
  return Response.json({ runId: authCheck.runId, ...result })
}
