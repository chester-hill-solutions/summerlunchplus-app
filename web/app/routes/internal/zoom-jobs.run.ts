import type { ActionFunctionArgs } from 'react-router'

import { runZoomJobs } from '@/lib/zoom-jobs/runner.server'

const unauthorized = () => new Response('Unauthorized', { status: 401 })

const hasValidSecret = (request: Request) => {
  const configured = process.env.ZOOM_RUNNER_SECRET
  if (!configured) return false
  const provided = request.headers.get('x-zoom-runner-secret')
  return Boolean(provided && provided === configured)
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!hasValidSecret(request)) {
    return unauthorized()
  }

  const appOrigin = new URL(request.url).origin
  const result = await runZoomJobs({ appOrigin })
  return Response.json(result)
}
