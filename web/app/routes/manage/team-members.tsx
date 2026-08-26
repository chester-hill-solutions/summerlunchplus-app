import { useEffect, useRef } from 'react'
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
import {
  ACCOUNT_DISABLE_BAN_DURATION,
  ACCOUNT_ENABLE_BAN_DURATION,
  isManageableTeamRole,
  MANAGEABLE_TEAM_ROLES,
} from '@/lib/team-roles'
import { adminClient } from '@/lib/supabase/adminClient'

import type { Route } from './+types/team-members'
import TableDisplay from './table-display'

type ActionData = {
  error?: string
  success?: boolean
  message?: string
}

const TEAM_ROLES = ['instructor', 'staff', 'manager', 'admin'] as const
const TEAM_ROLE_SET = new Set<string>(TEAM_ROLES)
const AUTH_USERS_PAGE_SIZE = 200
const AUTH_USERS_MAX_PAGES = 10
const shouldLogTeamMembersInstrumentation =
  process.env.NODE_ENV !== 'production' || process.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

const allowedInviteRolesFor = (role: string | null | undefined): string[] => {
  if (role === 'admin') return ['instructor', 'staff', 'manager', 'admin']
  if (role === 'manager') return ['instructor', 'staff']
  if (role === 'staff') return ['instructor']
  return []
}

const loadDisabledAuthUserMap = async (): Promise<Map<string, boolean>> => {
  const map = new Map<string, boolean>()
  for (let page = 1; page <= AUTH_USERS_MAX_PAGES; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: AUTH_USERS_PAGE_SIZE })
    if (error) {
      console.warn('[manage-team-members] unable to load auth user ban state', { page, error: error.message })
      break
    }
    for (const user of data.users ?? []) {
      map.set(user.id, Boolean(user.banned_until))
    }
    const nextPage = (data as { next_page?: number | null }).next_page ?? null
    if (!nextPage) break
    if (page === AUTH_USERS_MAX_PAGES) {
      console.warn('[manage-team-members] auth user listing hit page cap', { pages: AUTH_USERS_MAX_PAGES })
    }
  }
  return map
}

type ProfileTargetRow = {
  id: string
  user_id: string | null
  role: string | null
  email: string | null
}

const loadProfileTarget = async (profileId: string): Promise<
  { ok: true; row: ProfileTargetRow } | { ok: false; error: string }
> => {
  const { data, error } = await adminClient
    .from('profile')
    .select('id, user_id, role, email')
    .eq('id', profileId)
    .maybeSingle<ProfileTargetRow>()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Team member not found.' }
  return { ok: true, row: data }
}

const guardManageableTarget = (row: ProfileTargetRow): string | null => {
  if (!isManageableTeamRole(row.role)) {
    return 'Admin accounts cannot be modified here.'
  }
  return null
}

export async function loader({ request }: Route.LoaderArgs) {
  const startedAt = Date.now()
  const auth = await requireAuth(request)
  if (shouldLogTeamMembersInstrumentation) {
    console.info('[manage-team-members-loader]', {
      event: 'start',
      at: new Date().toISOString(),
      pathname: new URL(request.url).pathname,
      role: auth.claims.role,
      emailHint: auth.emailHint,
    })
  }
  if (!isRoleAtLeast(auth.claims.role, 'instructor')) {
    if (shouldLogTeamMembersInstrumentation) {
      console.info('[manage-team-members-loader]', {
        event: 'unauthorized',
        at: new Date().toISOString(),
        pathname: new URL(request.url).pathname,
        role: auth.claims.role,
      })
    }
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const { data, error } = await adminClient
    .from('profile')
    .select('id, user_id, role, email, firstname, surname, phone, postcode, password_set')
    .in('role', TEAM_ROLES)
    .order('role', { ascending: true })
    .order('surname', { ascending: true })
    .order('firstname', { ascending: true })

  if (error) {
    throw new Response(error.message, { status: 500, headers: auth.headers })
  }

  const disabledByUserId = await loadDisabledAuthUserMap()

  const result = {
    columns: ['role', 'email', 'firstname', 'surname', 'phone', 'postcode', 'password_set', 'disabled'],
    rows: (data ?? [])
      .filter(row => TEAM_ROLE_SET.has(String(row.role ?? '')))
      .map(row => ({
        ...row,
        disabled: row.user_id ? disabledByUserId.get(row.user_id) ?? false : false,
      })),
    label: 'Team',
    tableName: 'team',
    role: auth.claims.role,
    allowedInviteRoles: allowedInviteRolesFor(auth.claims.role),
    canManageRoles: auth.claims.role === 'admin',
  }

  if (shouldLogTeamMembersInstrumentation) {
    console.info('[manage-team-members-loader]', {
      event: 'complete',
      at: new Date().toISOString(),
      pathname: new URL(request.url).pathname,
      role: auth.claims.role,
      rowCount: result.rows.length,
      durationMs: Date.now() - startedAt,
    })
  }

  return result
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'instructor')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'invite')

  if (intent === 'change-role') return changeRoleAction({ auth, formData })
  if (intent === 'disable') return setAccountDisabledAction({ auth, formData, disabled: true })
  if (intent === 'enable') return setAccountDisabledAction({ auth, formData, disabled: false })

  const allowedInviteRoles = allowedInviteRolesFor(auth.claims.role)
  if (!allowedInviteRoles.length) {
    return { error: 'You do not have permission to invite team members.' } satisfies ActionData
  }

  const email = normalizeEmail((formData.get('email') as string | null) ?? '')
  const role = (formData.get('role') as string | null)?.trim() ?? ''

  if (!email) {
    return { error: 'Email is required' } satisfies ActionData
  }
  if (!isAllowedEmailDomain(email)) {
    return { error: 'Please enter a valid email address' } satisfies ActionData
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

type RequireAuthResult = Awaited<ReturnType<typeof requireAuth>>

const requireAdmin = (auth: RequireAuthResult) => {
  if (auth.claims.role !== 'admin') {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }
}

export const changeRoleAction = async ({
  auth,
  formData,
}: {
  auth: RequireAuthResult
  formData: FormData
}): Promise<ActionData> => {
  requireAdmin(auth)

  const profileId = String(formData.get('profile_id') ?? '').trim()
  const nextRole = String(formData.get('role') ?? '').trim()
  if (!profileId) return { error: 'Missing team member.' }
  if (!isManageableTeamRole(nextRole)) return { error: 'Invalid role.' }

  const target = await loadProfileTarget(profileId)
  if (!target.ok) return { error: target.error }

  const blockedReason = guardManageableTarget(target.row)
  if (blockedReason) return { error: blockedReason }

  if (target.row.user_id) {
    const { error } = await adminClient
      .from('user_roles')
      .upsert({ user_id: target.row.user_id, role: nextRole, assigned_by: auth.user.id }, { onConflict: 'user_id' })
    if (error) return { error: error.message }
  } else {
    const { error } = await adminClient.from('profile').update({ role: nextRole }).eq('id', profileId)
    if (error) return { error: error.message }
  }

  return { success: true, message: `Role updated to ${nextRole}.` }
}

export const setAccountDisabledAction = async ({
  auth,
  formData,
  disabled,
}: {
  auth: RequireAuthResult
  formData: FormData
  disabled: boolean
}): Promise<ActionData> => {
  requireAdmin(auth)

  const profileId = String(formData.get('profile_id') ?? '').trim()
  if (!profileId) return { error: 'Missing team member.' }

  const target = await loadProfileTarget(profileId)
  if (!target.ok) return { error: target.error }

  const blockedReason = guardManageableTarget(target.row)
  if (blockedReason) return { error: blockedReason }

  if (!target.row.user_id) {
    return { error: 'This member has not accepted their invite yet.' }
  }

  const { error } = await adminClient.auth.admin.updateUserById(target.row.user_id, {
    ban_duration: disabled ? ACCOUNT_DISABLE_BAN_DURATION : ACCOUNT_ENABLE_BAN_DURATION,
  })
  if (error) return { error: error.message }

  return { success: true, message: disabled ? 'Account disabled.' : 'Account enabled.' }
}

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
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" name="intent" value="change-role" disabled={busy}>
          {busy ? 'Working...' : 'Save role'}
        </Button>
        {hasAcceptedInvite ? (
          isDisabled ? (
            <Button type="submit" name="intent" value="enable" variant="outline" disabled={busy}>
              Enable account
            </Button>
          ) : (
            <Button type="submit" name="intent" value="disable" variant="outline" disabled={busy}>
              Disable account
            </Button>
          )
        ) : (
          <p className="pb-2 text-xs text-muted-foreground">Invite not accepted yet.</p>
        )}
      </fetcher.Form>
      {fetcher.data?.error ? <p className="mt-2 text-sm text-destructive">{fetcher.data.error}</p> : null}
      {fetcher.data?.success && fetcher.data.message ? (
        <p className="mt-2 text-sm text-emerald-600">{fetcher.data.message}</p>
      ) : null}
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
          {canInvite
            ? `You can invite: ${loaderData.allowedInviteRoles.join(', ')}.`
            : 'Instructors can view the team but cannot send invites.'}
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
          <p className="mt-1 text-sm text-muted-foreground">
            Change a member&apos;s role or disable their account. Admin accounts cannot be modified here.
          </p>
          <div className="mt-4 space-y-3">
            {loaderData.rows
              .filter(row => isManageableTeamRole(String(row.role ?? '')))
              .map(row => (
                <TeamAccessRow key={row.id} member={row} />
              ))}
          </div>
        </section>
      ) : null}

      <TableDisplay />
    </div>
  )
}
