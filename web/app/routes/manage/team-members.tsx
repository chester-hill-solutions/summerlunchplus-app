import { useFetcher } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireAuth } from '@/lib/auth.server'
import {
  ALLOWED_EMAIL_PATTERN,
  isAllowedEmailDomain,
  normalizeEmail,
} from '@/lib/email-domain'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'

import type { Route } from './+types/team-members'
import TableDisplay from './table-display'

type ActionData = {
  error?: string
  success?: boolean
}

const TEAM_ROLES = ['instructor', 'staff', 'manager', 'admin'] as const
const TEAM_ROLE_SET = new Set<string>(TEAM_ROLES)

const allowedInviteRolesFor = (role: string | null | undefined): string[] => {
  if (role === 'admin') return ['instructor', 'staff', 'manager', 'admin']
  if (role === 'manager') return ['instructor', 'staff']
  if (role === 'staff') return ['instructor']
  return []
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'instructor')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const { data, error } = await adminClient
    .from('profile')
    .select('id, role, email, firstname, surname, phone, postcode, password_set')
    .in('role', TEAM_ROLES)
    .order('role', { ascending: true })
    .order('surname', { ascending: true })
    .order('firstname', { ascending: true })

  if (error) {
    throw new Response(error.message, { status: 500, headers: auth.headers })
  }

  return {
    columns: ['role', 'email', 'firstname', 'surname', 'phone', 'postcode', 'password_set'],
    rows: (data ?? []).filter(row => TEAM_ROLE_SET.has(String(row.role ?? ''))),
    label: 'Team',
    tableName: 'team',
    role: auth.claims.role,
    allowedInviteRoles: allowedInviteRolesFor(auth.claims.role),
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'instructor')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const allowedInviteRoles = allowedInviteRolesFor(auth.claims.role)
  if (!allowedInviteRoles.length) {
    return { error: 'You do not have permission to invite team members.' } satisfies ActionData
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
  if (!allowedInviteRoles.includes(role)) {
    return { error: 'You are not allowed to invite this role.' } satisfies ActionData
  }

  const origin = new URL(request.url).origin
  const redirectTo = `${origin}/home`

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

  const { error: profileError } = await adminClient
    .from('profile')
    .upsert(
      {
        email,
        role,
        ...(inviteeUserId ? { user_id: inviteeUserId } : {}),
      },
      { onConflict: 'email' }
    )
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

export default function TeamMembersTablePage({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<ActionData>()
  const isSubmitting = fetcher.state === 'submitting'
  const canInvite = loaderData.allowedInviteRoles.length > 0

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Invite a team member</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {canInvite
            ? `You can invite: ${loaderData.allowedInviteRoles.join(', ')}.`
            : 'Instructors can view the team but cannot send invites.'}
        </p>

        {canInvite ? (
          <fetcher.Form method="post" className="mt-4 grid gap-4 md:grid-cols-[1fr_200px_auto]">
            <div className="grid gap-2">
              <Label htmlFor="team-invite-email">Gmail</Label>
              <Input
                id="team-invite-email"
                name="email"
                type="email"
                placeholder="name@gmail.com"
                pattern={ALLOWED_EMAIL_PATTERN}
                title="Use a valid Gmail address"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-invite-role">Role</Label>
              <select
                id="team-invite-role"
                name="role"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={loaderData.allowedInviteRoles[0] ?? 'instructor'}
                required
              >
                {loaderData.allowedInviteRoles.map(role => (
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
        ) : null}

        {fetcher.data?.error ? <p className="mt-3 text-sm text-destructive">{fetcher.data.error}</p> : null}
        {fetcher.data?.success ? <p className="mt-3 text-sm text-emerald-600">Invite sent.</p> : null}
      </section>

      <TableDisplay />
    </div>
  )
}
