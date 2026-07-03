import { useEffect, useMemo, useRef } from 'react'
import { Download } from 'lucide-react'
import { Form, useFetcher, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { resendEmailMessageById } from '@/lib/email/send-email.server'
import { EXPORT_TYPE_EMAIL_MESSAGE_CSV } from '@/lib/exports/types'
import { isRoleAtLeast } from '@/lib/roles'

import type { Route } from './+types/email-message'
import TableDisplay, { type LoaderData } from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('email-message')

const buildEmailMessageTableData = async (args: Route.LoaderArgs): Promise<LoaderData> => {
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
  } satisfies LoaderData
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const intent = formData.get('intent') as string | null
  if (intent !== 'resend-email') {
    return new Response('Unsupported action', { status: 400, headers: auth.headers })
  }

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

  return { ok: true }
}

export default function EmailMessageTablePage() {
  const fetcher = useFetcher<LoaderData>()
  const location = useLocation()
  const lastRequestedUrlRef = useRef<string | null>(null)

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
    } satisfies LoaderData)

  return (
    <div className="space-y-2">
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
            <Button type="submit" variant="outline" size="icon-sm" aria-label="Export CSV" title="Export CSV">
              <Download className="size-4" />
            </Button>
          </Form>
        }
      />
    </div>
  )
}
