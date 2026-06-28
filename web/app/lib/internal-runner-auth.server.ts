type SecretCheckOptions = {
  specificEnvVar?: string
  specificHeader?: string
}

type SecretCheckResult = {
  ok: boolean
  runId: string
}

const fallbackHeader = 'x-internal-runner-secret'

export const validateInternalRunnerRequest = (
  request: Request,
  options: SecretCheckOptions = {}
): SecretCheckResult => {
  const specificEnvVar = options.specificEnvVar ?? ''
  const specificHeader = options.specificHeader ?? ''

  const fallbackSecret = (process.env.INTERNAL_RUNNER_SECRET ?? '').trim()
  const specificSecret = specificEnvVar ? (process.env[specificEnvVar] ?? '').trim() : ''

  const providedFallback = (request.headers.get(fallbackHeader) ?? '').trim()
  const providedSpecific = specificHeader ? (request.headers.get(specificHeader) ?? '').trim() : ''

  const fallbackMatches = Boolean(fallbackSecret && providedFallback && fallbackSecret === providedFallback)
  const specificMatches = Boolean(specificSecret && providedSpecific && specificSecret === providedSpecific)

  const runId = (request.headers.get('x-cron-run-id') ?? '').trim() || `manual-${Date.now().toString(36)}`

  return {
    ok: fallbackMatches || specificMatches,
    runId,
  }
}
