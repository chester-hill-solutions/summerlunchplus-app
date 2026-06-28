import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('zoom-host')
export const action = createTableAction('zoom-host')

export default function ZoomHostTablePage() {
  return <TableDisplay />
}
