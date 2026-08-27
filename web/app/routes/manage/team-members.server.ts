import { requireAuth } from '@/lib/auth.server'
import {
  isAllowedEmailDomain,
  normalizeEmail,
} from '@/lib/email-domain'
import { isRoleAtLeast } from '@/lib/roles'
import {
  ACCOUNT_DISABLE_BAN_DURATION,
  ACCOUNT_ENABLE_BAN_DURATION,
  isManageableTeamRole,
} from '@/lib/team-roles'

import type { Route } from './+types/team-members'

export type ActionData = {
  error?: string
  success?: boolean
  message?: string
}

const TEAM_ROLES = ['instructor', 'staff', 'manager', 'admin'] as const
const TEAM_ROLE_SET = new Set<string>(TEAM_ROLES)
const AUTH_USERS_PAGE_SIZE = 200
const AUTH_USERS_MAX_PAGES = 10
const SUPER_ADMIN_EMAIL = 'sai+admin@chsolutions.ca'
const ALL_TEAM_ROLES = ['instructor', 'staff', 'manager', 'admin'] as const

const getAdminClient = async () => (await import('@/lib/supabase/adminClient.server')).adminClient
const isSuperAdmin = (auth: Awaited<ReturnType<typeof requireAuth>>) =>
  auth.user.email?.toLowerCase() === SUPER_ADMIN_EMAIL
const shouldLogTeamMembersInstrumentation =
  process.env.NODE_ENV !== 'production' || process.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

const allowedInviteRolesFor = (role: string | null | undefined): string[] => {
  if (role === 'admin') return ['instructor', 'staff', 'manager', 'admin']
  if (role === 'manager') return ['instructor', 'staff']
  if (role === 'staff') return ['instructor']
  return []
}

const loadDisabledAuthUserMap = async (): Promise<Map<string, boolean>> => {
  const adminClient = await getAdminClient()
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
  const adminClient = await getAdminClient()
  const { data, error } = await adminClient
    .from('profile')
    .select('id, user_id, role, email')
    .eq('id', profileId)
    .maybeSingle<ProfileTargetRow>()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Team member not found.' }
  return { ok: true, row: data }
}

const guardManageableTarget = (row: ProfileTargetRow, canManageAdmins: boolean): string | null => {
  if (!isManageableTeamRole(row.role) && !(canManageAdmins && row.role === 'admin')) {
    return 'Admin accounts cannot be modified here.'
  }
  return null
}

export async function loader({ request }: Route.LoaderArgs) {
  const startedAt = Date.now()
  const auth = await requireAuth(request)
  const canManageAllTeamMembers = isSuperAdmin(auth)
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

  const adminClient = await getAdminClient()
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
    columnMeta: {
      role: { minWidth: 220, preferredWidth: 220 },
      disabled: { minWidth: 180, preferredWidth: 180 },
    },
    role: auth.claims.role,
    allowedInviteRoles: allowedInviteRolesFor(auth.claims.role),
    canManageRoles: auth.claims.role === 'admin' || canManageAllTeamMembers,
    canManageAllTeamMembers,
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

  const adminClient = await getAdminClient()
  const allowedInviteRoles = allowedInviteRolesFor(auth.claims.role)
  if (!allowedInviteRoles.length) {
    return { error: 'You do not have permission to invite team members.' } satisfies ActionData
  }

  const email = normalizeEmail((formData.get('email') as string | null) ?? '')
  const role = (formData.get('role') as string | null)?.trim() ?? ''
  if (!email) return { error: 'Email is required' } satisfies ActionData
  if (!isAllowedEmailDomain(email)) return { error: 'Please enter a valid email address' } satisfies ActionData
  if (!allowedInviteRoles.includes(role)) return { error: 'You are not allowed to invite this role.' } satisfies ActionData

  const redirectTo = `${new URL(request.url).origin}/home`
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
    if (linkError) return { error: inviteError.message ?? linkError.message ?? 'Unable to send invite' } satisfies ActionData
    inviteeUserId = linkData?.user?.id ?? inviteeUserId
  }

  const { error: profileError } = await adminClient
    .from('profile')
    .upsert({ email, role, ...(inviteeUserId ? { user_id: inviteeUserId } : {}) }, { onConflict: 'email' })
  if (profileError) return { error: profileError.message } satisfies ActionData

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
  if (inviteRowError) return { error: inviteRowError.message } satisfies ActionData
  return { success: true } satisfies ActionData
}

type RequireAuthResult = Awaited<ReturnType<typeof requireAuth>>

const requireAdmin = (auth: RequireAuthResult) => {
  if (auth.claims.role !== 'admin' && !isSuperAdmin(auth)) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }
}

export const changeRoleAction = async ({ auth, formData }: { auth: RequireAuthResult; formData: FormData }): Promise<ActionData> => {
  requireAdmin(auth)
  const adminClient = await getAdminClient()
  const profileId = String(formData.get('profile_id') ?? '').trim()
  const nextRole = String(formData.get('role') ?? '').trim()
  if (!profileId) return { error: 'Missing team member.' }
  if (!ALL_TEAM_ROLES.includes(nextRole as (typeof ALL_TEAM_ROLES)[number])) return { error: 'Invalid role.' }

  const target = await loadProfileTarget(profileId)
  if (!target.ok) return { error: target.error }
  const blockedReason = guardManageableTarget(target.row, isSuperAdmin(auth))
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
  const adminClient = await getAdminClient()
  const profileId = String(formData.get('profile_id') ?? '').trim()
  if (!profileId) return { error: 'Missing team member.' }

  const target = await loadProfileTarget(profileId)
  if (!target.ok) return { error: target.error }
  const blockedReason = guardManageableTarget(target.row, isSuperAdmin(auth))
  if (blockedReason) return { error: blockedReason }
  if (!target.row.user_id) return { error: 'This member has not accepted their invite yet.' }

  const { error } = await adminClient.auth.admin.updateUserById(target.row.user_id, {
    ban_duration: disabled ? ACCOUNT_DISABLE_BAN_DURATION : ACCOUNT_ENABLE_BAN_DURATION,
  })
  if (error) return { error: error.message }
  return { success: true, message: disabled ? 'Account disabled.' : 'Account enabled.' }
}
