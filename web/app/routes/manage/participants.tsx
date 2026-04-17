import type { Route } from './+types/participants'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('profile')

const PARTICIPANT_ROLES = new Set(['guardian', 'student', 'unassigned'])

export async function loader({ request }: Route.LoaderArgs) {
  const base = await baseLoader({ request })
  const filteredRows = (base.rows as Record<string, unknown>[]).filter(row =>
    PARTICIPANT_ROLES.has(String(row.role ?? ''))
  )
  const rows = filteredRows.map(row => ({
    ...row,
    is_user: row.user_id ? 'TRUE' : 'FALSE',
  }))

  const columns = (base.columns as string[]).map(column =>
    column === 'user_email' ? 'is_user' : column
  )

  return {
    ...base,
    label: 'Participants',
    columns,
    rows,
  }
}

export default function ParticipantsTablePage() {
  return <TableDisplay />
}
