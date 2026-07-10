type ActionProfileCheckpoint = {
  step: string
  durationMs: number
  extra?: Record<string, unknown>
}

const shouldLogActionProfile = () =>
  process.env.NODE_ENV !== 'production' ||
  process.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

export const createActionProfile = ({
  name,
  request,
}: {
  name: string
  request: Request
}) => {
  const url = new URL(request.url)
  const startedAt = Date.now()
  let lastAt = startedAt
  const checkpoints: ActionProfileCheckpoint[] = []
  const traceId = `${name}:${startedAt.toString(36)}`

  const mark = (step: string, extra?: Record<string, unknown>) => {
    const now = Date.now()
    checkpoints.push({
      step,
      durationMs: now - lastAt,
      extra,
    })
    lastAt = now
  }

  const complete = (extra?: Record<string, unknown>) => {
    if (!shouldLogActionProfile()) return

    console.info('[action-profile]', {
      event: `${name}_complete`,
      traceId,
      pathname: url.pathname,
      totalDurationMs: Date.now() - startedAt,
      checkpoints,
      ...extra,
    })
  }

  const log = (event: string, extra?: Record<string, unknown>) => {
    if (!shouldLogActionProfile()) return

    console.info('[action-profile]', {
      event,
      traceId,
      pathname: url.pathname,
      ...extra,
    })
  }

  return {
    traceId,
    mark,
    complete,
    log,
  }
}
