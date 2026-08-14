import type { ActionFunctionArgs } from 'react-router'

import { validateInternalRunnerRequest } from '@/lib/internal-runner-auth.server'
import { runPostProgramSurveyJobs } from '@/lib/post-program-survey/runner.server'

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authCheck = validateInternalRunnerRequest(request)
  if (!authCheck.ok) {
    return new Response('Unauthorized', { status: 401 })
  }

  const appOrigin = new URL(request.url).origin
  const result = await runPostProgramSurveyJobs({ appOrigin, runId: authCheck.runId })
  return Response.json(result, { status: result.errors.length ? 500 : 200 })
}
