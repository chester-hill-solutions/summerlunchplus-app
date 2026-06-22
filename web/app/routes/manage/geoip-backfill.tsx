import { Form, useActionData, useLoaderData, useNavigation } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { previewGeoipBackfill, runGeoipBackfill } from '@/lib/geoip.server'
import { isRoleAtLeast } from '@/lib/roles'

import type { Route } from './+types/geoip-backfill'

type ActionData = {
  error?: string
  result?: Awaited<ReturnType<typeof runGeoipBackfill>>
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const preview = await previewGeoipBackfill()
  return { preview }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    return { error: 'Unauthorized' } satisfies ActionData
  }

  const formData = await request.formData()
  const maxLookupsRaw = Number(formData.get('max_lookups') ?? 200)
  const maxLookups = Number.isFinite(maxLookupsRaw) && maxLookupsRaw > 0
    ? Math.min(1000, Math.floor(maxLookupsRaw))
    : 200

  const result = await runGeoipBackfill({ maxLookups })
  return { result } satisfies ActionData
}

export default function GeoipBackfillPage() {
  const { preview } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>() as ActionData | undefined
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">System</p>
        <h1 className="text-2xl font-semibold">GeoIP backfill</h1>
        <p className="text-sm text-muted-foreground">
          Manually backfill geolocation cache from recent login and submission IP records.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Current coverage</h2>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <p><span className="font-medium">Provider:</span> {preview.provider}</p>
          <p><span className="font-medium">Provider enabled:</span> {preview.providerEnabled ? 'Yes' : 'No'}</p>
          <p><span className="font-medium">Scanned form submissions:</span> {preview.scannedRows.formSubmission}</p>
          <p><span className="font-medium">Scanned login events:</span> {preview.scannedRows.loginEvent}</p>
          <p><span className="font-medium">Unique valid IPs:</span> {preview.uniqueIpCount}</p>
          <p><span className="font-medium">Cached IPs:</span> {preview.cachedIpCount}</p>
          <p><span className="font-medium">Missing cache entries:</span> {preview.missingIpCount}</p>
        </div>
        {preview.missingIpsSample.length ? (
          <div className="pt-2">
            <p className="text-xs font-medium text-muted-foreground">Sample missing IPs</p>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(preview.missingIpsSample, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>

      <Form method="post" className="rounded-lg border bg-card p-4 space-y-3">
        <label className="grid gap-1 text-sm md:max-w-xs">
          <span className="text-muted-foreground">Max lookups this run (1-1000)</span>
          <input
            name="max_lookups"
            type="number"
            min={1}
            max={1000}
            defaultValue={200}
            className="h-10 rounded border border-input bg-background px-3"
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isSubmitting ? 'Running backfill...' : 'Run GeoIP backfill'}
        </button>
      </Form>

      {actionData?.error ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {actionData.error}
        </section>
      ) : null}

      {actionData?.result ? (
        <section className="rounded-lg border bg-card p-4 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Last run result</h2>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <p><span className="font-medium">Attempted lookups:</span> {actionData.result.attempted}</p>
            <p><span className="font-medium">Resolved:</span> {actionData.result.resolved}</p>
            <p><span className="font-medium">Unresolved:</span> {actionData.result.unresolved}</p>
            <p><span className="font-medium">Cached after run:</span> {actionData.result.cachedIpCount}</p>
            <p><span className="font-medium">Missing after run:</span> {actionData.result.missingIpCount}</p>
            <p><span className="font-medium">Provider enabled:</span> {actionData.result.providerEnabled ? 'Yes' : 'No'}</p>
          </div>
          {Object.keys(actionData.result.failureReasonCounts).length ? (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground">Unresolved reason counts</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(actionData.result.failureReasonCounts, null, 2)}
              </pre>
            </div>
          ) : null}
          {actionData.result.attemptedIpsSample.length ? (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground">Attempted IPs sample</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(actionData.result.attemptedIpsSample, null, 2)}
              </pre>
            </div>
          ) : null}
          {actionData.result.unresolvedIpsSample.length ? (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground">Unresolved IPs sample</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(actionData.result.unresolvedIpsSample, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
