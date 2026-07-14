import type { Route } from './+types/participants'
import { parseFilterClauseValues, serializeFilterClause } from '@/lib/table-filter-params'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('profile')

const PARTICIPANT_ROLE_VALUES = ['guardian', 'student', 'unassigned'] as const
const PARTICIPANT_ROLES = new Set(PARTICIPANT_ROLE_VALUES)
const isParticipantRole = (value: string): value is (typeof PARTICIPANT_ROLE_VALUES)[number] =>
  PARTICIPANT_ROLES.has(value as (typeof PARTICIPANT_ROLE_VALUES)[number])

export async function loader(args: Route.LoaderArgs) {
  const url = new URL(args.request.url)
  const requestedRoleClause = parseFilterClauseValues(url.searchParams.getAll('f_role'))
  const effectiveRoleValues: string[] =
    requestedRoleClause?.op === 'in'
      ? requestedRoleClause.values.filter(isParticipantRole)
      : requestedRoleClause?.op === 'not_in'
        ? PARTICIPANT_ROLE_VALUES.filter(value => !requestedRoleClause.values.includes(value))
        : [...PARTICIPANT_ROLE_VALUES]

  url.searchParams.delete('f_role')
  url.searchParams.append('f_role', serializeFilterClause({ op: 'in', values: effectiveRoleValues }))

  const request = new Request(url.toString(), args.request)
  const base = await baseLoader({ ...args, request })
  const rows = (base.rows as Record<string, unknown>[]).map(row => ({
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
    columnMeta: {
      ...(base.columnMeta ?? {}),
      is_user: { label: 'Is user', filterable: true },
    },
  }
}

export default function ParticipantsTablePage() {
  return <TableDisplay />
}
