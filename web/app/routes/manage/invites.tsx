import { useFetcher, useLoaderData } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireAuth } from '@/lib/auth.server'
import {
  ALLOWED_EMAIL_PATTERN,
  isAllowedEmailDomain,
  normalizeEmail,
} from '@/lib/email-domain'
import { isRoleAtLeast, ROLE_ORDER } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'

import type { Route } from './+types/invites'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('invites')

type ActionData = {
  error?: string
  success?: boolean
}

const SIGN_UP_ROLES = new Set(['guardian', 'student', 'unassigned'])

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const email = normalizeEmail((formData.get('email') as string | null) ?? '')
  const role = (formData.get('role') as string | null)?.trim() ?? ''

  if (!email) {
    return { error: 'Gmail is required' } satisfies ActionData
  }
  if (!isAllowedEmailDomain(email)) {
    return { error: 'Please enter a valid Gmail address' } satisfies ActionData
  }
  if (!ROLE_ORDER.includes(role as (typeof ROLE_ORDER)[number])) {
    return { error: 'Role is invalid' } satisfies ActionData
  }

  const origin = new URL(request.url).origin
  const redirectTo = SIGN_UP_ROLES.has(role)
    ? `${origin}/auth/sign-up-details?role=${role}`
    : `${origin}/home`

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { role },
  })
  let inviteeUserId = inviteData?.user?.id ?? null

  if (inviteError) {
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo, data: { role } },
    })
    if (linkError) {
      return { error: inviteError.message ?? linkError.message ?? 'Unable to send invite' } satisfies ActionData
    }
    inviteeUserId = linkData?.user?.id ?? inviteeUserId
  }

  const profilePayload = {
    email,
    role,
    ...(inviteeUserId ? { user_id: inviteeUserId } : {}),
  }
  const { error: profileError } = await adminClient
    .from('profile')
    .upsert(profilePayload, { onConflict: 'email' })
  if (profileError) {
    return { error: profileError.message } satisfies ActionData
  }

  const { error: inviteRowError } = await adminClient.from('invites').upsert(
    {
      inviter_user_id: auth.user.id,
      invitee_user_id: inviteeUserId,
      invitee_email: email,
      role,
      status: 'pending',
    },
    { onConflict: 'invitee_email' }
  )
  if (inviteRowError) {
    return { error: inviteRowError.message } satisfies ActionData
  }

  return { success: true } satisfies ActionData
}

export default function InvitesTablePage() {
  useLoaderData()
  const fetcher = useFetcher<ActionData>()
  const isSubmitting = fetcher.state === 'submitting'

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Invite a user</h2>
        <fetcher.Form method="post" className="mt-4 grid gap-4 md:grid-cols-[1fr_200px_auto]">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Gmail</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              placeholder="name@gmail.com"
              pattern={ALLOWED_EMAIL_PATTERN}
              title="Use a valid Gmail address"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              name="role"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue="guardian"
              required
            >
              {ROLE_ORDER.map(role => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send invite'}
            </Button>
          </div>
        </fetcher.Form>
        {fetcher.data?.error ? (
          <p className="mt-3 text-sm text-destructive">{fetcher.data.error}</p>
        ) : null}
        {fetcher.data?.success ? (
          <p className="mt-3 text-sm text-emerald-600">Invite sent.</p>
        ) : null}
      </section>
      <TableDisplay />
    </div>
  )
}
