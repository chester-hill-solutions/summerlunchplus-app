import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('class')
export const action = createTableAction('class')

export default function ClassTablePage() {
  return <TableDisplay />
}
