import { Form, redirect, useActionData, useNavigation } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { resetZoomProcessingState } from '@/lib/zoom-jobs/reset.server'

import type { Route } from './+types/zoom-reset'

type ActionData = {
  error?: string
  success?: string
  result?: Awaited<ReturnType<typeof resetZoomProcessingState>>
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    throw redirect('/manage', { headers: auth.headers })
  }
  return {}
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  if (intent !== 'run-reset') {
    return { error: 'Unsupported action.' } satisfies ActionData
  }

  const scope = String(formData.get('scope') ?? '') === 'within_36h' ? 'within_36h' : 'all_future'
  const dryRun = String(formData.get('dry_run') ?? 'true') !== 'false'
  const confirmation = String(formData.get('confirm_text') ?? '').trim()
  const confirmationAgain = String(formData.get('confirm_text_again') ?? '').trim()
  const acknowledgedDanger = String(formData.get('acknowledge_danger') ?? '') === 'yes'

  if (!dryRun && !acknowledgedDanger) {
    return {
      error: 'You must acknowledge the destructive warning before executing reset.',
    } satisfies ActionData
  }

  if (!dryRun && (confirmation !== 'RESET ZOOM' || confirmationAgain !== 'RESET ZOOM')) {
    return {
      error: 'Type RESET ZOOM in both confirmation fields to run a destructive reset.',
    } satisfies ActionData
  }

  const result = await resetZoomProcessingState({
    dryRun,
    scope,
  })

  if (result.aborted) {
    return {
      error: 'Reset aborted because one or more Zoom meeting deletions failed. No local state was removed.',
      result,
    } satisfies ActionData
  }

  return {
    success: dryRun ? 'Dry run completed.' : 'Reset completed.',
    result,
  } satisfies ActionData
}

export default function ZoomResetPage() {
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4">
        <h1 className="text-xl font-semibold">Zoom Reset</h1>
        <p className="text-sm text-muted-foreground">
          Deprovision Zoom meetings and reset Zoom + attendance processing state for future classes.
        </p>
      </section>

      <section className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 text-destructive">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Danger Zone</h2>
        <p className="mt-1 text-sm">
          Execute mode is destructive. It deletes scheduled Zoom meetings for the selected scope and clears local Zoom processing state.
        </p>
        <p className="mt-1 text-sm font-medium">
          Use dry run first. Only execute if you are certain you want to remove current provisioning state.
        </p>
      </section>

      {actionData?.error ? (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionData.error}
        </p>
      ) : null}
      {actionData?.success ? (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {actionData.success}
        </p>
      ) : null}

      <section className="rounded-lg border bg-card p-4">
        <Form method="post" className="space-y-3">
          <input type="hidden" name="intent" value="run-reset" />

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Scope</span>
            <select name="scope" defaultValue="all_future" className="w-full rounded border px-2 py-1">
              <option value="all_future">All future classes</option>
              <option value="within_36h">Only next 36 hours</option>
            </select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Mode</span>
            <select name="dry_run" defaultValue="true" className="w-full rounded border px-2 py-1">
              <option value="true">Dry run (no writes)</option>
              <option value="false">Execute reset (destructive)</option>
            </select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Confirmation text (required for execute mode)</span>
            <input
              name="confirm_text"
              type="text"
              autoComplete="off"
              placeholder="Type RESET ZOOM"
              className="w-full rounded border px-2 py-1"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Confirmation text again (required for execute mode)</span>
            <input
              name="confirm_text_again"
              type="text"
              autoComplete="off"
              placeholder="Type RESET ZOOM again"
              className="w-full rounded border px-2 py-1"
            />
          </label>

          <label className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-sm">
            <input name="acknowledge_danger" type="checkbox" value="yes" className="mt-0.5" />
            <span>
              I understand this is destructive and may remove meeting provisioning state that cannot be automatically restored.
            </span>
          </label>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Running...' : 'Run reset'}
          </Button>
        </Form>
      </section>

      {actionData?.result ? (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Result</h2>
          <pre className="overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(actionData.result, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  )
}
