import { Link, redirect, useFetcher, useLoaderData } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireAuth } from '@/lib/auth.server'
import type { Json } from '@/lib/database.types'
import {
  getDraftForEditor,
  previewDraft,
  publishDraft,
  rollbackDraftToVersion,
  saveDraft,
} from '@/lib/email/drafts/service.server'
import type { EmailDraftSchema, EmailDraftStatus } from '@/lib/email/drafts/types'
import { sendTransactionalEmail } from '@/lib/email/send-email.server'
import { isRoleAtLeast } from '@/lib/roles'
import { parseSchemaInput, validateDraftForPublish } from '@/lib/email/drafts/validators'

import type { Route } from './+types/email-drafts.$draftId'

type ActionData = {
  ok?: boolean
  message?: string
  error?: string
  errors?: string[]
  preview?: {
    subject: string
    html: string
    text: string
    missingVariables: string[]
  }
}

const normalizeStatus = (value: string): EmailDraftStatus => {
  if (value === 'draft' || value === 'published' || value === 'archived') return value
  return 'draft'
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'manager')) {
    throw redirect('/manage', { headers: auth.headers })
  }

  const draftId = params.draftId
  if (!draftId) {
    throw redirect('/manage/email-drafts', { headers: auth.headers })
  }

  const { draft, versions } = await getDraftForEditor(draftId)
  const schema = (draft.variables_schema ?? {}) as EmailDraftSchema
  const validation = validateDraftForPublish({
    channel: draft.channel,
    triggerSummary: draft.trigger_summary,
    subjectMarkdown: draft.current_subject_markdown,
    bodyMarkdown: draft.current_body_markdown,
    variablesSchema: schema,
  })
  const initialPreview = previewDraft({
    subjectMarkdown: draft.current_subject_markdown,
    bodyMarkdown: draft.current_body_markdown,
  })

  return {
    draft,
    versions,
    schemaText: JSON.stringify(schema, null, 2),
    validation,
    initialPreview,
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'manager')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const draftId = params.draftId
  if (!draftId) {
    return { error: 'Missing draft id' } satisfies ActionData
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')

  if (intent === 'preview-draft') {
    const subjectMarkdown = String(formData.get('subject_markdown') ?? '')
    const bodyMarkdown = String(formData.get('body_markdown') ?? '')
    const sampleVariablesText = String(formData.get('sample_variables') ?? '').trim()
    let sampleVariables: Record<string, unknown> = {}

    if (sampleVariablesText) {
      try {
        const parsed = JSON.parse(sampleVariablesText)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { error: 'Sample variables must be a JSON object.' } satisfies ActionData
        }
        sampleVariables = parsed as Record<string, unknown>
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Sample variables must be valid JSON.',
        } satisfies ActionData
      }
    }

    const preview = previewDraft({
      subjectMarkdown,
      bodyMarkdown,
      variables: sampleVariables,
    })

    return { ok: true, preview } satisfies ActionData
  }

  if (intent === 'send-test-email') {
    const toEmail = String(formData.get('to_email') ?? '').trim().toLowerCase()
    const sampleVariablesText = String(formData.get('sample_variables') ?? '').trim()
    let sampleVariables: Record<string, unknown> = {}

    if (!toEmail) {
      return { error: 'Test recipient email is required.' } satisfies ActionData
    }

    if (sampleVariablesText) {
      try {
        const parsed = JSON.parse(sampleVariablesText)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { error: 'Sample variables must be a JSON object.' } satisfies ActionData
        }
        sampleVariables = parsed as Record<string, unknown>
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Sample variables must be valid JSON.',
        } satisfies ActionData
      }
    }

    const { draft } = await getDraftForEditor(draftId)
    const rendered = previewDraft({
      subjectMarkdown: draft.current_subject_markdown,
      bodyMarkdown: draft.current_body_markdown,
      variables: sampleVariables,
    })

    const sendResult = await sendTransactionalEmail({
      toEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateKey: `email_draft_test:${draft.draft_key}`,
      templateData: sampleVariables as Json,
      eventKey: null,
      triggeredByUserId: auth.user.id,
    })

    if (sendResult.status === 'failed') {
      return { error: sendResult.error ?? 'Unable to send test email.' } satisfies ActionData
    }

    if (sendResult.status === 'skipped') {
      return { error: 'Test email was skipped unexpectedly.' } satisfies ActionData
    }

    return { ok: true, message: `Test email sent to ${toEmail}.` } satisfies ActionData
  }

  if (intent === 'save-draft') {
    const title = String(formData.get('title') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    const triggerSummary = String(formData.get('trigger_summary') ?? '').trim()
    const triggerEventKey = String(formData.get('trigger_event_key') ?? '').trim()
    const triggerOwner = String(formData.get('trigger_owner') ?? '').trim()
    const status = normalizeStatus(String(formData.get('status') ?? 'draft'))
    const subjectMarkdown = String(formData.get('subject_markdown') ?? '')
    const bodyMarkdown = String(formData.get('body_markdown') ?? '')
    const schemaText = String(formData.get('variables_schema') ?? '')

    if (!title) {
      return { error: 'Title is required.' } satisfies ActionData
    }

    if (!triggerSummary) {
      return { error: 'When this email sends is required.' } satisfies ActionData
    }

    if (triggerSummary.length > 200) {
      return { error: 'When this email sends must be 200 characters or fewer.' } satisfies ActionData
    }

    const parsedSchema = parseSchemaInput(schemaText)
    if (parsedSchema.error) {
      return { error: `Variables schema error: ${parsedSchema.error}` } satisfies ActionData
    }

    await saveDraft({
      draftId,
      actorUserId: auth.user.id,
      title,
      description: description || null,
      triggerSummary,
      triggerEventKey: triggerEventKey || null,
      triggerOwner: triggerOwner || null,
      status,
      subjectMarkdown,
      bodyMarkdown,
      variablesSchema: parsedSchema.schema,
    })

    return { ok: true } satisfies ActionData
  }

  if (intent === 'publish-draft') {
    const result = await publishDraft({
      draftId,
      actorUserId: auth.user.id,
      changeNote: String(formData.get('change_note') ?? '').trim() || null,
    })

    if (!result.ok) {
      return {
        error: 'Draft did not pass publish validation.',
        errors: result.errors,
      } satisfies ActionData
    }

    return { ok: true } satisfies ActionData
  }

  if (intent === 'rollback-draft') {
    const versionId = String(formData.get('version_id') ?? '')
    if (!versionId) {
      return { error: 'Missing version id.' } satisfies ActionData
    }

    const result = await rollbackDraftToVersion({
      draftId,
      versionId,
      actorUserId: auth.user.id,
    })

    if (!result.ok) {
      return { error: result.error } satisfies ActionData
    }

    return { ok: true } satisfies ActionData
  }

  return { error: 'Unsupported action.' } satisfies ActionData
}

export default function EmailDraftEditorPage() {
  const { draft, versions, schemaText, validation, initialPreview } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<ActionData>()
  const isSubmitting = fetcher.state === 'submitting'

  const preview = fetcher.data?.preview ?? initialPreview

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{draft.title}</h1>
          <p className="text-sm text-muted-foreground">
            {draft.channel} - {draft.status}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/manage/email-drafts">Back to drafts</Link>
        </Button>
      </div>

      {fetcher.data?.error ? <p className="text-sm text-red-500">{fetcher.data.error}</p> : null}
      {fetcher.data?.message ? <p className="text-sm text-emerald-600">{fetcher.data.message}</p> : null}
      {fetcher.data?.errors?.length ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {fetcher.data.errors.map(error => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Draft editor</CardTitle>
          <CardDescription>
            Edit markdown content. Use Advanced for trigger and metadata settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="save-draft" />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" defaultValue={draft.title} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={draft.status}
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="subject-markdown">Subject markdown</Label>
              <Input
                id="subject-markdown"
                name="subject_markdown"
                defaultValue={draft.current_subject_markdown}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="body-markdown">Body markdown</Label>
              <textarea
                id="body-markdown"
                name="body_markdown"
                defaultValue={draft.current_body_markdown}
                rows={12}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>

            <details className="rounded-md border bg-muted/10">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Advanced</summary>
              <div className="space-y-4 border-t px-3 py-3">
                <div className="grid gap-2">
                  <Label htmlFor="draft-key">Draft key</Label>
                  <Input id="draft-key" value={draft.draft_key} readOnly className="font-mono text-xs" />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" defaultValue={draft.description ?? ''} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="trigger-summary">When this email sends (plain language)</Label>
                  <Input
                    id="trigger-summary"
                    name="trigger_summary"
                    defaultValue={draft.trigger_summary}
                    maxLength={200}
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="trigger-event-key">Trigger event key (optional)</Label>
                    <Input
                      id="trigger-event-key"
                      name="trigger_event_key"
                      defaultValue={draft.trigger_event_key ?? ''}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="trigger-owner">Trigger owner file (optional)</Label>
                    <Input
                      id="trigger-owner"
                      name="trigger_owner"
                      defaultValue={draft.trigger_owner ?? ''}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="variables-schema">Variables schema (JSON)</Label>
                  <textarea
                    id="variables-schema"
                    name="variables_schema"
                    defaultValue={schemaText}
                    rows={8}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                  />
                </div>
              </div>
            </details>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save draft'}
              </Button>
              {!validation.ok ? (
                <span className="text-xs text-amber-600">Current draft has publish validation issues.</span>
              ) : (
                <span className="text-xs text-emerald-600">Current draft passes publish validation.</span>
              )}
            </div>

            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">This email sends when:</span>{' '}
              {draft.trigger_summary || 'Trigger summary is missing.'}
            </div>
          </fetcher.Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview + publish</CardTitle>
          <CardDescription>Preview uses the latest saved markdown content for this draft.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fetcher.Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="preview-draft" />
            <input type="hidden" name="subject_markdown" value={draft.current_subject_markdown} />
            <input type="hidden" name="body_markdown" value={draft.current_body_markdown} />
            <div className="grid gap-2">
              <Label htmlFor="sample-variables">Sample variables JSON</Label>
              <textarea
                id="sample-variables"
                name="sample_variables"
                rows={5}
                placeholder='{"actorName":"Alex","workshopName":"Beginner Kitchen"}'
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              />
            </div>
            <Button type="submit" variant="outline" disabled={isSubmitting}>
              {isSubmitting ? 'Rendering...' : 'Preview with variables'}
            </Button>
          </fetcher.Form>

          <fetcher.Form method="post" className="space-y-3 rounded-md border p-3">
            <input type="hidden" name="intent" value="send-test-email" />
            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="to-email">Test recipient</Label>
                <Input id="to-email" name="to_email" type="email" placeholder="team@example.com" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="test-sample-variables">Sample variables JSON</Label>
                <Input
                  id="test-sample-variables"
                  name="sample_variables"
                  placeholder='{"actorName":"Alex"}'
                />
              </div>
            </div>
            <Button type="submit" variant="outline" disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send test email'}
            </Button>
          </fetcher.Form>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Rendered subject</p>
              <p className="text-sm font-medium">{preview.subject || '(empty subject)'}</p>
              {preview.missingVariables.length ? (
                <p className="mt-2 text-xs text-amber-600">
                  Missing variables: {preview.missingVariables.join(', ')}
                </p>
              ) : null}
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Rendered text</p>
              <pre className="whitespace-pre-wrap text-xs">{preview.text || '(empty text body)'}</pre>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Rendered HTML</p>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">{preview.html}</pre>
          </div>

          <fetcher.Form method="post" className="space-y-2">
            <input type="hidden" name="intent" value="publish-draft" />
            <div className="grid gap-2">
              <Label htmlFor="change-note">Change note (optional)</Label>
              <Input id="change-note" name="change_note" placeholder="Updated signup CTA copy" />
            </div>
            <Button type="submit" disabled={isSubmitting || !validation.ok}>
              {isSubmitting ? 'Publishing...' : 'Publish new version'}
            </Button>
          </fetcher.Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
          <CardDescription>Published snapshots are immutable and can be rolled back into draft mode.</CardDescription>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions published yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Version</th>
                    <th className="px-3 py-2 font-medium">Published</th>
                    <th className="px-3 py-2 font-medium">Change note</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map(version => (
                    <tr key={version.id} className="border-t">
                      <td className="px-3 py-2 font-medium">v{version.version_number}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {version.published_at
                          ? new Intl.DateTimeFormat(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(version.published_at))
                          : '-'}
                      </td>
                      <td className="px-3 py-2">{version.change_note ?? '-'}</td>
                      <td className="px-3 py-2">
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="rollback-draft" />
                          <input type="hidden" name="version_id" value={version.id} />
                          <Button type="submit" variant="outline" size="sm" disabled={isSubmitting}>
                            Roll back
                          </Button>
                        </fetcher.Form>
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
