import { Form, useActionData, useNavigation } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { normalizeZoomApiEndpoint } from '@/lib/zoom-jobs/endpoint.server'

import type { Route } from './+types/zoom-connect-test'

type ActionData =
  | {
      ok: true
      status: number
      payload: unknown
    }
  | {
      ok: false
      status?: number
      error: string
      payload?: unknown
      diagnostics?: Record<string, unknown>
    }

const formatError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return { message: 'Unknown error type', value: String(error) }
  }

  const cause = error.cause
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause:
      cause instanceof Error
        ? { name: cause.name, message: cause.message, stack: cause.stack }
        : cause ?? null,
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }
  return null
}

export async function action({ request }: Route.ActionArgs): Promise<ActionData> {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return { ok: false, error: 'Unauthorized' }
  }

  const endpointRaw = (process.env.ZOOM_API_ENDPOINT ?? '').trim()
  const apiKey = (process.env.ZOOM_API_KEY ?? '').trim()

  if (!apiKey) {
    return { ok: false, error: 'Missing ZOOM_API_KEY.' }
  }

  let endpoint: string
  try {
    endpoint = normalizeZoomApiEndpoint(endpointRaw)
  } catch (error) {
    console.error('[zoom-connect-test] endpoint normalization failed', {
      endpointRaw,
      hasApiKey: Boolean(apiKey),
      apiKeyLength: apiKey.length,
      error: formatError(error),
    })
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Missing ZOOM_API_ENDPOINT.',
      diagnostics: {
        endpointRaw,
        hasApiKey: Boolean(apiKey),
        apiKeyLength: apiKey.length,
      },
    }
  }

  const targetUrl = `${endpoint}/zoom/connect`
  const traceId = `zct-${Date.now().toString(36)}`

  console.info('[zoom-connect-test] request starting', {
    traceId,
    endpointRaw,
    endpoint,
    targetUrl,
    hasApiKey: Boolean(apiKey),
    apiKeyLength: apiKey.length,
  })

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    const contentType = response.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null)

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Zoom connect test failed with HTTP ${response.status}.`,
        payload,
        diagnostics: {
          traceId,
          endpointRaw,
          endpoint,
          targetUrl,
          responseStatus: response.status,
          responseContentType: contentType,
        },
      }
    }

    console.info('[zoom-connect-test] request succeeded', {
      traceId,
      targetUrl,
      status: response.status,
      contentType,
    })

    return {
      ok: true,
      status: response.status,
      payload,
    }
  } catch (error) {
    console.error('[zoom-connect-test] fetch failed', {
      traceId,
      endpointRaw,
      endpoint,
      targetUrl,
      hasApiKey: Boolean(apiKey),
      apiKeyLength: apiKey.length,
      error: formatError(error),
    })

    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected zoom connect error.',
      diagnostics: {
        traceId,
        endpointRaw,
        endpoint,
        targetUrl,
        hasApiKey: Boolean(apiKey),
        apiKeyLength: apiKey.length,
        error: formatError(error),
      },
    }
  }
}

export default function ZoomConnectTestPage() {
  const actionData = useActionData<typeof action>() as ActionData | undefined
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Zoom Connect Test</h1>
        <p className="text-sm text-muted-foreground">
          Sends a test request to <code>/zoom/connect</code> using <code>ZOOM_API_ENDPOINT</code> and <code>ZOOM_API_KEY</code>.
        </p>
      </div>

      <Form method="post">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Testing...' : 'Test /zoom/connect'}
        </Button>
      </Form>

      {actionData ? (
        <div className="rounded-md border bg-card p-4 text-sm">
          <p className={actionData.ok ? 'text-emerald-700' : 'text-red-700'}>
            {actionData.ok
              ? `Success (HTTP ${actionData.status})`
              : `${actionData.error}${actionData.status ? ` (HTTP ${actionData.status})` : ''}`}
          </p>
          {'payload' in actionData && actionData.payload !== undefined ? (
            <pre className="mt-3 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(actionData.payload, null, 2)}</pre>
          ) : null}
          {'diagnostics' in actionData && actionData.diagnostics ? (
            <pre className="mt-3 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(actionData.diagnostics, null, 2)}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
