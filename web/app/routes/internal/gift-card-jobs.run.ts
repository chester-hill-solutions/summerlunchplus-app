import type { ActionFunctionArgs } from 'react-router'

import { runGiftCardJobs } from '@/lib/gift-cards/runner.server'
import { validateInternalRunnerRequest } from '@/lib/internal-runner-auth.server'

const unauthorized = () => new Response('Unauthorized', { status: 401 })

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authCheck = validateInternalRunnerRequest(request)
  if (!authCheck.ok) {
    return unauthorized()
  }

  const appOrigin = new URL(request.url).origin
  console.info('[internal][gift-card-jobs.run] starting', { runId: authCheck.runId })
  const result = await runGiftCardJobs({ appOrigin, runId: authCheck.runId })
  return Response.json(result)
}
