import type { Route } from './+types/participants'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('profile')

const PARTICIPANT_ROLES = new Set(['guardian', 'student', 'unassigned'])

export async function loader({ request }: Route.LoaderArgs) {
  const base = await baseLoader({ request })
  const rows = (base.rows as Record<string, unknown>[]).filter(row =>
    PARTICIPANT_ROLES.has(String(row.role ?? ''))
  )

  return {
    ...base,
    label: 'Participants',
    rows,
  }
}

export default function ParticipantsTablePage() {
  return <TableDisplay />
}
