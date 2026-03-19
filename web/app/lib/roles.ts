export const ROLE_ORDER = [
  'unassigned',
  'student',
  'guardian',
  'instructor',
  'staff',
  'manager',
  'admin',
] as const

export type AppRole = (typeof ROLE_ORDER)[number]

export const rolesUpTo = (role: string | null | undefined) => {
  const index = role ? ROLE_ORDER.indexOf(role as AppRole) : -1
  if (index === -1) return []
  return ROLE_ORDER.slice(0, index + 1)
}

export const isRoleAtLeast = (role: string | null | undefined, minimumRole: AppRole) => {
  const roleIndex = role ? ROLE_ORDER.indexOf(role as AppRole) : -1
  const minimumIndex = ROLE_ORDER.indexOf(minimumRole)
  if (roleIndex === -1) return false
  return roleIndex >= minimumIndex
}
