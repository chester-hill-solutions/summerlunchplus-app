import type { Route } from './+types/team-members'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('profile')

const TEAM_ROLES = new Set(['instructor', 'staff', 'manager', 'admin'])

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows as Record<string, unknown>[]).filter(row =>
    TEAM_ROLES.has(String(row.role ?? ''))
  )

  return {
    ...base,
    label: 'Team',
    rows,
  }
}

export default function TeamMembersTablePage() {
  return <TableDisplay />
}
