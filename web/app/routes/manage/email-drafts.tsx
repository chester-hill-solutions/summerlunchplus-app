import { Link, redirect, useFetcher, useLoaderData } from 'react-router'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireAuth } from '@/lib/auth.server'
import { createDraft, listDrafts } from '@/lib/email/drafts/service.server'
import { isRoleAtLeast } from '@/lib/roles'

import type { Route } from './+types/email-drafts'

type ActionData = {
  error?: string
}

const normalizeDraftKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, '_')
    .replaceAll(/[^a-z0-9_.-]/g, '_')

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'manager')) {
    throw redirect('/manage', { headers: auth.headers })
  }

  const url = new URL(request.url)
  const channelFilter = url.searchParams.get('channel')
  const statusFilter = url.searchParams.get('status')

  const drafts = await listDrafts({
    channel: channelFilter === 'auth' || channelFilter === 'transactional' ? channelFilter : 'all',
    status:
      statusFilter === 'draft' || statusFilter === 'published' || statusFilter === 'archived'
        ? statusFilter
        : 'all',
  })

  return {
    drafts,
    channelFilter: channelFilter ?? 'all',
    statusFilter: statusFilter ?? 'all',
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'manager')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  if (intent !== 'create-draft') {
    return { error: 'Unsupported action' } satisfies ActionData
  }

  const title = String(formData.get('title') ?? '').trim()
  const draftKey = normalizeDraftKey(String(formData.get('draft_key') ?? ''))
  const triggerSummary = String(formData.get('trigger_summary') ?? '').trim()
  const triggerEventKey = String(formData.get('trigger_event_key') ?? '').trim()
  const triggerOwner = String(formData.get('trigger_owner') ?? '').trim()
  const channel = String(formData.get('channel') ?? '')

  if (!title) {
    return { error: 'Title is required.' } satisfies ActionData
  }

  if (!draftKey) {
    return { error: 'Draft key is required.' } satisfies ActionData
  }

  if (!triggerSummary) {
    return { error: 'When this email sends is required.' } satisfies ActionData
  }

  if (triggerSummary.length > 200) {
    return { error: 'When this email sends must be 200 characters or fewer.' } satisfies ActionData
  }

  if (channel !== 'auth' && channel !== 'transactional') {
    return { error: 'Select a valid channel.' } satisfies ActionData
  }

  try {
    const created = await createDraft({
      draftKey,
      title,
      triggerSummary,
      triggerEventKey: triggerEventKey || null,
      triggerOwner: triggerOwner || null,
      channel,
      actorUserId: auth.user.id,
    })

    return redirect(`/manage/email-drafts/${created.id}`, { headers: auth.headers })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to create draft.',
    } satisfies ActionData
  }
}

export default function EmailDraftsPage() {
  const { drafts, channelFilter, statusFilter } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<ActionData>()
  const creating = fetcher.state === 'submitting'
  const [showCreateForm, setShowCreateForm] = useState(false)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xl">Create email draft</CardTitle>
            <Button type="button" variant="outline" onClick={() => setShowCreateForm(previous => !previous)}>
              {showCreateForm ? 'Hide form' : 'New draft'}
            </Button>
          </div>
          <CardDescription>
            Draft keys are stable identifiers used by send logic. Add a short plain-language trigger.
          </CardDescription>
        </CardHeader>
        {showCreateForm ? (
        <CardContent>
          <fetcher.Form method="post" className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="intent" value="create-draft" />
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" placeholder="Family enrollment accepted" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="draft-key">Draft key</Label>
              <Input id="draft-key" name="draft_key" placeholder="family_enrollment_accepted_v1" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="channel">Channel</Label>
              <select
                id="channel"
                name="channel"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="transactional"
                required
              >
                <option value="transactional">transactional</option>
                <option value="auth">auth</option>
              </select>
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="trigger-summary">When this email sends (plain language)</Label>
              <Input
                id="trigger-summary"
                name="trigger_summary"
                placeholder="Sent to family emails when staff approves enrollment."
                maxLength={200}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="trigger-event-key">Trigger event key (optional)</Label>
              <Input
                id="trigger-event-key"
                name="trigger_event_key"
                placeholder="workshop_enrollment.family_accepted"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="trigger-owner">Trigger owner file (optional)</Label>
              <Input
                id="trigger-owner"
                name="trigger_owner"
                placeholder="web/app/routes/manage/workshop-enrollment.tsx"
              />
            </div>
            <div className="flex items-end md:col-span-2">
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create draft'}
              </Button>
            </div>
          </fetcher.Form>
          {fetcher.data?.error ? <p className="mt-3 text-sm text-red-500">{fetcher.data.error}</p> : null}
        </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Email drafts</CardTitle>
          <CardDescription>
            Filtered view. Active filters: channel={channelFilter}, status={statusFilter}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drafts found for selected filters.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Key</th>
                    <th className="px-3 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 font-medium">When this sends</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map(draft => (
                    <tr key={draft.id} className="border-t">
                      <td className="px-3 py-2">
                        <Link to={`/manage/email-drafts/${draft.id}`} className="font-medium text-primary hover:underline">
                          {draft.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{draft.draft_key}</td>
                      <td className="px-3 py-2">{draft.channel}</td>
                      <td className="px-3 py-2 text-muted-foreground">{draft.trigger_summary || '-'}</td>
                      <td className="px-3 py-2">{draft.status}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(draft.updated_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
