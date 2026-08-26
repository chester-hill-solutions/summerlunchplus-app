import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ALLOWED_EMAIL_PATTERN } from '@/lib/email-domain'
import { isManageableTeamRole, MANAGEABLE_TEAM_ROLES } from '@/lib/team-roles'

import type { Route } from './+types/team-members'
import type { ActionData } from './team-members.server'
import TableDisplay from './table-display'

export { action, loader } from './team-members.server'

type TeamAccessRowProps = {
  member: {
    id: string
    user_id: string | null
    role: string | null
    email: string | null
    firstname: string | null
    surname: string | null
    disabled?: boolean
  }
}

const TeamAccessRow = ({ member }: TeamAccessRowProps) => {
  const fetcher = useFetcher<ActionData>()
  const busy = fetcher.state !== 'idle'
  const displayName = [member.firstname, member.surname].filter(Boolean).join(' ') || 'Unnamed member'
  const isDisabled = Boolean(member.disabled)
  const hasAcceptedInvite = Boolean(member.user_id)

  return (
    <div className="rounded-md border p-3">
      <fetcher.Form method="post" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="profile_id" value={member.id} />
        <div className="min-w-48 flex-1">
          <p className="text-sm font-medium">{displayName}</p>
          <p className="text-xs text-muted-foreground">{member.email ?? 'No email'}</p>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`team-access-role-${member.id}`}>Role</Label>
          <select
            id={`team-access-role-${member.id}`}
            name="role"
            defaultValue={String(member.role ?? '')}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            disabled={busy}
          >
            {MANAGEABLE_TEAM_ROLES.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
        <Button type="submit" name="intent" value="change-role" disabled={busy}>
          {busy ? 'Working...' : 'Save role'}
        </Button>
        {hasAcceptedInvite ? (
          isDisabled ? (
            <Button type="submit" name="intent" value="enable" variant="outline" disabled={busy}>Enable account</Button>
          ) : (
            <Button type="submit" name="intent" value="disable" variant="outline" disabled={busy}>Disable account</Button>
          )
        ) : (
          <p className="pb-2 text-xs text-muted-foreground">Invite not accepted yet.</p>
        )}
      </fetcher.Form>
      {fetcher.data?.error ? <p className="mt-2 text-sm text-destructive">{fetcher.data.error}</p> : null}
      {fetcher.data?.success && fetcher.data.message ? <p className="mt-2 text-sm text-emerald-600">{fetcher.data.message}</p> : null}
    </div>
  )
}

export default function TeamMembersTablePage({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<ActionData>()
  const formRef = useRef<HTMLFormElement | null>(null)
  const isSubmitting = fetcher.state !== 'idle'
  const canInvite = loaderData.allowedInviteRoles.length > 0

  useEffect(() => {
    if (!fetcher.data?.success || fetcher.state !== 'idle') return
    formRef.current?.reset()
  }, [fetcher.data, fetcher.state])

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Invite a team member</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {canInvite ? `You can invite: ${loaderData.allowedInviteRoles.join(', ')}.` : 'Instructors can view the team but cannot send invites.'}
        </p>
        {canInvite ? (
          <fetcher.Form ref={formRef} method="post" className="mt-4 grid gap-4 md:grid-cols-[1fr_200px_auto]">
            <div className="grid gap-2">
              <Label htmlFor="team-invite-email">Email</Label>
              <Input
                id="team-invite-email"
                name="email"
                type="email"
                placeholder="name@example.com"
                pattern={ALLOWED_EMAIL_PATTERN}
                title="Use a valid email address"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-invite-role">Role</Label>
              <select id="team-invite-role" name="role" className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={loaderData.allowedInviteRoles[0] ?? 'instructor'} required>
                {loaderData.allowedInviteRoles.map(role => <option key={role} value={role}>{role}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="cursor-pointer disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                {isSubmitting ? 'Sending...' : 'Send invite'}
              </Button>
            </div>
          </fetcher.Form>
        ) : null}
        {fetcher.data?.error ? <p className="mt-3 text-sm text-destructive">{fetcher.data.error}</p> : null}
        {fetcher.data?.success ? <p className="mt-3 text-sm text-emerald-600">Invite sent.</p> : null}
      </section>

      {loaderData.canManageRoles ? (
        <section className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Role and access</h2>
          <p className="mt-1 text-sm text-muted-foreground">Change a member&apos;s role or disable their account. Admin accounts cannot be modified here.</p>
          <div className="mt-4 space-y-3">
            {loaderData.rows.filter(row => isManageableTeamRole(String(row.role ?? ''))).map(row => <TeamAccessRow key={row.id} member={row} />)}
          </div>
        </section>
      ) : null}

      <TableDisplay />
    </div>
  )
}
