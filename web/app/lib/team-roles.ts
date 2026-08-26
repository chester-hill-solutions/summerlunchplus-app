export const MANAGEABLE_TEAM_ROLES = ['instructor', 'staff', 'manager'] as const

const MANAGEABLE_TEAM_ROLE_SET = new Set<string>(MANAGEABLE_TEAM_ROLES)

export const isManageableTeamRole = (role: string | null | undefined): boolean =>
  MANAGEABLE_TEAM_ROLE_SET.has(String(role ?? '').trim())

export const ACCOUNT_DISABLE_BAN_DURATION = '876000h'
export const ACCOUNT_ENABLE_BAN_DURATION = 'none'

export const isValidManageableRoleChange = (role: string | null | undefined): role is (typeof MANAGEABLE_TEAM_ROLES)[number] =>
  isManageableTeamRole(role)
