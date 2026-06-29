import type { ActionFunctionArgs } from 'react-router'

import { validateInternalRunnerRequest } from '@/lib/internal-runner-auth.server'
import { resetZoomProcessingState } from '@/lib/zoom-jobs/reset.server'

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

  let body: { dryRun?: unknown; scope?: unknown; now?: unknown } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }

  const scope = body.scope === 'within_36h' ? 'within_36h' : 'all_future'
  const dryRun = body.dryRun === false ? false : true
  const nowValue = typeof body.now === 'string' ? new Date(body.now) : new Date()
  const now = Number.isFinite(nowValue.getTime()) ? nowValue : new Date()

  const result = await resetZoomProcessingState({ now, dryRun, scope })
  return Response.json({ runId: authCheck.runId, ...result })
}
