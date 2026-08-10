import type { ActionFunctionArgs } from 'react-router'

import { runGiftCardInventoryAlerts } from '@/lib/gift-cards/runner.server'
import { validateInternalRunnerRequest } from '@/lib/internal-runner-auth.server'

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const authCheck = validateInternalRunnerRequest(request)
  if (!authCheck.ok) return new Response('Unauthorized', { status: 401 })
  return Response.json(await runGiftCardInventoryAlerts({ appOrigin: new URL(request.url).origin }))
}
