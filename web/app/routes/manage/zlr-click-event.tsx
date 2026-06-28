import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('zlr-click-event')
export const action = createTableAction('zlr-click-event')

export default function ZlrClickEventTablePage() {
  return <TableDisplay />
}
