import { requireAuth } from '@/lib/auth.server'
import { resendEmailMessageById } from '@/lib/email/send-email.server'
import { isRoleAtLeast } from '@/lib/roles'

import type { Route } from './+types/email-message'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('email-message')

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
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
  return <TableDisplay />
}
