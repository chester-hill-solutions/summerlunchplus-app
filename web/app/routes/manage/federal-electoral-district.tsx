import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

import type { Route } from './+types/federal-electoral-district'

const baseLoader = createTableLoader('federal-electoral-district')

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const columns = base.columns.includes('accepted')
    ? base.columns
    : ['code', 'name', 'total', 'accepted', 'pending', 'waitlisted', 'declined', ...base.columns.filter(column => !['code', 'name'].includes(column))]

  const rows = (base.rows ?? []).map(row => ({
    ...row,
    total: '...',
    accepted: '...',
    pending: '...',
    waitlisted: '...',
    declined: '...',
  }))

  return {
    ...base,
    columns,
    rows,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      total: { label: 'total', numeric: true },
      accepted: { label: 'accepted', numeric: true },
      pending: { label: 'pending', numeric: true },
      waitlisted: { label: 'waitlisted', numeric: true },
      declined: { label: 'declined', numeric: true },
    },
  }
}

export const action = createTableAction('federal-electoral-district')

export default function FederalElectoralDistrictTablePage() {
  return <TableDisplay />
}
