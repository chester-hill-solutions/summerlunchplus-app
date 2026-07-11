import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Form, useActionData, useFetcher, useLoaderData, useLocation, useNavigation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireAuth } from '@/lib/auth.server'
import type { Json } from '@/lib/database.types'
import { resendEmailMessageById, sendTransactionalEmail } from '@/lib/email/send-email.server'
import { EXPORT_TYPE_EMAIL_MESSAGE_CSV } from '@/lib/exports/types'
import { isRoleAtLeast } from '@/lib/roles'

import type { Route } from './+types/email-message'
import TableDisplay, { type LoaderData } from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('email-message')

type PageLoaderData = LoaderData & {
  manualEmailFrom: string
}

type ActionData = {
  ok?: boolean
  error?: string
  message?: string
  batchResult?: {
    fileName: string
    recipientCount: number
    validRecipientCount: number
    invalidRecipientCount: number
    sent: number
    skipped: number
    failed: number
    invalidEmails: string[]
    failedRecipients: Array<{ email: string; error: string }>
  }
}

const resolveVisibleFromAddress = () =>
  (process.env.EMAIL_FROM ?? 'SummerLunch Plus <hub@summerlunchplus.com>').trim() ||
  'SummerLunch Plus <hub@summerlunchplus.com>'

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const bodyTextToHtml = (text: string) => {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map(part => part.trim())
    .filter(Boolean)

  if (!paragraphs.length) {
    return '<p></p>'
  }

  return paragraphs
    .map(paragraph => `<p>${escapeHtml(paragraph).replaceAll(/\r?\n/g, '<br />')}</p>`)
    .join('')
}

const parseEmailsFromCsv = async (csvText: string) => {
  const { parse } = await import('csv-parse/sync')
  const rows = parse(csvText, {
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as string[][]

  if (!rows.length) {
    return {
      valid: [] as string[],
      invalid: [] as string[],
    }
  }

  const headerIndex = rows[0].findIndex(cell => cell.trim().toLowerCase() === 'email')
  const startIndex = headerIndex >= 0 ? 1 : 0
  const seen = new Set<string>()
  const valid: string[] = []
  const invalid: string[] = []

  for (let rowIndex = startIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const rawValue = headerIndex >= 0 ? (row[headerIndex] ?? '') : (row[0] ?? '')
    const normalized = normalizeEmail(rawValue)
    if (!normalized) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)

    if (isValidEmail(normalized)) {
      valid.push(normalized)
    } else {
      invalid.push(normalized)
    }
  }

  return { valid, invalid }
}

const buildEmailMessageTableData = async (args: Route.LoaderArgs): Promise<PageLoaderData> => {
  const url = new URL(args.request.url)
  url.searchParams.delete('page')
  url.searchParams.delete('pageSize')
  url.searchParams.set('sort', '__full_scan__')
  url.searchParams.delete('dir')

  const base = await baseLoader({ ...args, request: new Request(url.toString(), args.request) })
  return {
    ...base,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      resend: {
        label: 'resend',
        filterable: false,
      },
    },
    manualEmailFrom: resolveVisibleFromAddress(),
  }
}

export async function loader(args: Route.LoaderArgs) {
  const url = new URL(args.request.url)
  if (url.searchParams.get('_deferTable') === '1') {
    return buildEmailMessageTableData(args)
  }

  return {
    columns: [],
    rows: [],
    totalRows: 0,
    serverSideQuery: false,
    label: 'Email Messages',
    tableName: 'email-message',
    tableVariant: 'default' as const,
    columnMeta: {
      resend: {
        label: 'resend',
        filterable: false,
      },
    },
    manualEmailFrom: resolveVisibleFromAddress(),
  } satisfies PageLoaderData
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const intent = formData.get('intent') as string | null
  if (intent === 'resend-email') {
    const emailMessageId = formData.get('email_message_id') as string | null
    if (!emailMessageId) {
      return new Response('Missing email message id', { status: 400, headers: auth.headers })
    }

    const result = await resendEmailMessageById({
      emailMessageId,
      triggeredByUserId: auth.user.id,
    })

    if (!result.ok) {
      return new Response(result.error ?? 'Unable to resend email', { status: 500, headers: auth.headers })
    }

    return { ok: true } satisfies ActionData
  }

  if (intent !== 'send-manual-batch-email') {
    return new Response('Unsupported action', { status: 400, headers: auth.headers })
  }

  const csvFile = formData.get('recipients_csv')
  const subject = String(formData.get('subject') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()

  if (!(csvFile instanceof File)) {
    return { error: 'Recipient CSV is required.' } satisfies ActionData
  }

  if (!subject) {
    return { error: 'Subject is required.' } satisfies ActionData
  }

  if (!body) {
    return { error: 'Body is required.' } satisfies ActionData
  }

  const csvText = await csvFile.text()
  const { valid, invalid } = await parseEmailsFromCsv(csvText)

  if (!valid.length) {
    return {
      error: invalid.length
        ? 'CSV did not contain any valid email addresses.'
        : 'CSV is empty or missing recipient rows.',
      batchResult: {
        fileName: csvFile.name,
        recipientCount: valid.length + invalid.length,
        validRecipientCount: valid.length,
        invalidRecipientCount: invalid.length,
        sent: 0,
        skipped: 0,
        failed: 0,
        invalidEmails: invalid.slice(0, 20),
        failedRecipients: [],
      },
    } satisfies ActionData
  }

  const maxRecipientsPerRun = 1000
  if (valid.length > maxRecipientsPerRun) {
    return {
      error: `Too many recipients (${valid.length}). Maximum per send is ${maxRecipientsPerRun}.`,
      batchResult: {
        fileName: csvFile.name,
        recipientCount: valid.length + invalid.length,
        validRecipientCount: valid.length,
        invalidRecipientCount: invalid.length,
        sent: 0,
        skipped: 0,
        failed: 0,
        invalidEmails: invalid.slice(0, 20),
        failedRecipients: [],
      },
    } satisfies ActionData
  }

  const html = bodyTextToHtml(body)
  const batchRunId = `manual-batch-${Date.now().toString(36)}`
  let sent = 0
  let skipped = 0
  let failed = 0
  const failedRecipients: Array<{ email: string; error: string }> = []

  for (const toEmail of valid) {
    const eventKey = `manual-batch:${batchRunId}:${toEmail}`
    const result = await sendTransactionalEmail({
      toEmail,
      subject,
      html,
      text: body,
      templateKey: 'manual_batch_email_v1',
      templateData: {
        subject,
        body,
        source_file_name: csvFile.name,
        batch_run_id: batchRunId,
      } as Json,
      eventKey,
      triggeredByUserId: auth.user.id,
    })

    if (result.status === 'sent') {
      sent += 1
      continue
    }

    if (result.status === 'skipped') {
      skipped += 1
      continue
    }

    failed += 1
    failedRecipients.push({
      email: toEmail,
      error: result.error ?? 'Unknown send error',
    })
  }

  const summary = `${sent} sent, ${skipped} skipped, ${failed} failed out of ${valid.length} valid recipients.`
  return {
    ok: failed === 0,
    message: summary,
    ...(failed > 0 ? { error: 'Some emails failed to send. See details below.' } : {}),
    batchResult: {
      fileName: csvFile.name,
      recipientCount: valid.length + invalid.length,
      validRecipientCount: valid.length,
      invalidRecipientCount: invalid.length,
      sent,
      skipped,
      failed,
      invalidEmails: invalid.slice(0, 20),
      failedRecipients: failedRecipients.slice(0, 20),
    },
  } satisfies ActionData
}

export default function EmailMessageTablePage() {
  const pageData = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>() as ActionData | undefined
  const navigation = useNavigation()
  const fetcher = useFetcher<PageLoaderData>()
  const location = useLocation()
  const lastRequestedUrlRef = useRef<string | null>(null)
  const [manualEmailModalOpen, setManualEmailModalOpen] = useState(false)

  const isSendingManualBatch =
    navigation.state !== 'idle' && navigation.formData?.get('intent') === 'send-manual-batch-email'
  const isCreatingExport = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'create-export'

  const dataRequestUrl = useMemo(() => {
    const search = new URLSearchParams(location.search)
    search.set('_deferTable', '1')
    return `/manage/email-message?${search.toString()}`
  }, [location.search])

  useEffect(() => {
    if (lastRequestedUrlRef.current === dataRequestUrl) return
    lastRequestedUrlRef.current = dataRequestUrl
    fetcher.load(dataRequestUrl)
  }, [dataRequestUrl])

  const sourcePath = useMemo(() => {
    const search = new URLSearchParams(location.search)
    search.set('_deferTable', '1')
    return `/manage/email-message?${search.toString()}`
  }, [location.search])
  const data =
    fetcher.data ??
    ({
      columns: [],
      rows: [],
      totalRows: 0,
      serverSideQuery: false,
      label: 'Email Messages',
      tableName: 'email-message',
      tableVariant: 'default' as const,
      columnMeta: {
        resend: {
          label: 'resend',
          filterable: false,
        },
      },
      manualEmailFrom: pageData.manualEmailFrom,
    } satisfies PageLoaderData)

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => setManualEmailModalOpen(true)}>
          Manual Email
        </Button>
      </div>

      {manualEmailModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
          <button
            type="button"
            aria-label="Close manual email modal"
            className="absolute inset-0 bg-black/40"
            onClick={() => setManualEmailModalOpen(false)}
          />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-3xl">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Manual Batch Email</CardTitle>
                  <CardDescription>
                    Upload a CSV and send one email per recipient. Messages are sent individually, not as CC or BCC.
                  </CardDescription>
                </div>
                <Button type="button" variant="ghost" onClick={() => setManualEmailModalOpen(false)}>
                  Close
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <Form method="post" encType="multipart/form-data" className="space-y-4">
                  <input type="hidden" name="intent" value="send-manual-batch-email" />

                  <div className="grid gap-2">
                    <Label htmlFor="manual-email-from">From</Label>
                    <Input id="manual-email-from" value={pageData.manualEmailFrom} readOnly disabled />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="manual-recipients-csv">Recipients CSV</Label>
                    <Input id="manual-recipients-csv" name="recipients_csv" type="file" accept=".csv,text/csv" required />
                    <p className="text-xs text-muted-foreground">
                      Use an <code>email</code> header or put emails in the first column. Duplicates are removed.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="manual-subject">Subject</Label>
                    <Input id="manual-subject" name="subject" maxLength={300} required />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="manual-body">Body</Label>
                    <textarea
                      id="manual-body"
                      name="body"
                      rows={8}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    />
                  </div>

                  <Button type="submit" disabled={isSendingManualBatch}>
                    {isSendingManualBatch ? 'Sending...' : 'Send Individually'}
                  </Button>
                </Form>

                {actionData?.message ? (
                  <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                    {actionData.message}
                  </div>
                ) : null}
                {actionData?.error ? (
                  <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {actionData.error}
                  </div>
                ) : null}
                {actionData?.batchResult ? (
                  <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <p>
                      File: {actionData.batchResult.fileName} | Total rows: {actionData.batchResult.recipientCount} | Valid:{' '}
                      {actionData.batchResult.validRecipientCount} | Invalid: {actionData.batchResult.invalidRecipientCount}
                    </p>
                    {actionData.batchResult.invalidEmails.length ? (
                      <p>Invalid emails (up to 20): {actionData.batchResult.invalidEmails.join(', ')}</p>
                    ) : null}
                    {actionData.batchResult.failedRecipients.length ? (
                      <p>
                        Failed recipients (up to 20):{' '}
                        {actionData.batchResult.failedRecipients.map(item => `${item.email} (${item.error})`).join(', ')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {fetcher.state !== 'idle' && !fetcher.data ? (
        <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Loading email messages...
        </div>
      ) : null}
      <TableDisplay
        data={data}
        paginationActions={
          <Form method="post" action="/manage/exports" className="flex items-center gap-2">
            <input type="hidden" name="intent" value="create-export" />
            <input type="hidden" name="export_type" value={EXPORT_TYPE_EMAIL_MESSAGE_CSV} />
            <input type="hidden" name="source_path" value={sourcePath} />
            <Button
              type="submit"
              variant="outline"
              size="icon-sm"
              disabled={isCreatingExport}
              aria-label={isCreatingExport ? 'Exporting CSV' : 'Export CSV'}
              title={isCreatingExport ? 'Exporting CSV...' : 'Export CSV'}
            >
              {isCreatingExport ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            </Button>
          </Form>
        }
      />
    </div>
  )
}
