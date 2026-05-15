import { useLoaderData } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { extractRequestMetadata } from '@/lib/request-metadata.server'

import type { LoaderFunctionArgs } from 'react-router'

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const metadata = extractRequestMetadata(request)
  const headers = Object.fromEntries(
    [
      'x-forwarded-for',
      'x-real-ip',
      'cf-connecting-ip',
      'fly-client-ip',
      'x-vercel-forwarded-for',
      'user-agent',
      'accept-language',
      'origin',
      'referer',
    ].map(name => [name, request.headers.get(name)])
  )

  return {
    metadata,
    headers,
    note: 'Use this page in Railway staging to verify which proxy/network headers arrive at the app.',
  }
}

export default function RequestMetadataPage() {
  const data = useLoaderData<typeof loader>()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Request metadata diagnostics</h1>
        <p className="text-sm text-muted-foreground">{data.note}</p>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Extracted metadata</h2>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(data.metadata, null, 2)}</pre>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Raw incoming headers</h2>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(data.headers, null, 2)}</pre>
      </section>
    </div>
  )
}
