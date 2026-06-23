const INTERNAL_RUNNER_HEADER = 'x-export-runner-secret'

const internalSecretForRunner = () => process.env.EXPORT_RUNNER_SECRET

const internalEndpointFor = (request: Request, pathname: string) => {
  const url = new URL(request.url)
  url.pathname = pathname
  url.search = ''
  url.hash = ''
  return url.toString()
}

export type InternalTriggerResult = {
  attempted: boolean
  ok: boolean
  status?: number
  reason?: 'missing-secret' | 'network-error'
}

export const triggerExportRunner = async ({ request }: { request: Request }) => {
  const secret = internalSecretForRunner()
  if (!secret) {
    return { attempted: false, ok: false, reason: 'missing-secret' } satisfies InternalTriggerResult
  }

  try {
    const response = await fetch(internalEndpointFor(request, '/internal/export-jobs/run'), {
      method: 'POST',
      headers: {
        [INTERNAL_RUNNER_HEADER]: secret,
      },
    })

    return {
      attempted: true,
      ok: response.ok,
      status: response.status,
    } satisfies InternalTriggerResult
  } catch {
    return { attempted: true, ok: false, reason: 'network-error' } satisfies InternalTriggerResult
  }
}

export const triggerExportCleanup = async ({ request }: { request: Request }) => {
  const secret = internalSecretForRunner()
  if (!secret) {
    return { attempted: false, ok: false, reason: 'missing-secret' } satisfies InternalTriggerResult
  }

  try {
    const response = await fetch(internalEndpointFor(request, '/internal/export-jobs/cleanup'), {
      method: 'POST',
      headers: {
        [INTERNAL_RUNNER_HEADER]: secret,
      },
    })

    return {
      attempted: true,
      ok: response.ok,
      status: response.status,
    } satisfies InternalTriggerResult
  } catch {
    return { attempted: true, ok: false, reason: 'network-error' } satisfies InternalTriggerResult
  }
}
