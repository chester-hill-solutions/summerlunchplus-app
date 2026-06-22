const INTERNAL_RUNNER_HEADER = 'x-export-runner-secret'

const internalSecretForRunner = () => process.env.EXPORT_RUNNER_SECRET

const internalEndpointFor = (request: Request, pathname: string) => {
  const url = new URL(request.url)
  url.pathname = pathname
  url.search = ''
  url.hash = ''
  return url.toString()
}

export const triggerExportRunner = async ({ request }: { request: Request }) => {
  const secret = internalSecretForRunner()
  if (!secret) return

  await fetch(internalEndpointFor(request, '/internal/export-jobs/run'), {
    method: 'POST',
    headers: {
      [INTERNAL_RUNNER_HEADER]: secret,
    },
  })
}

export const triggerExportCleanup = async ({ request }: { request: Request }) => {
  const secret = internalSecretForRunner()
  if (!secret) return

  await fetch(internalEndpointFor(request, '/internal/export-jobs/cleanup'), {
    method: 'POST',
    headers: {
      [INTERNAL_RUNNER_HEADER]: secret,
    },
  })
}
