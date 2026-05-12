import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form')
export const action = createTableAction('form')

export default function FormsTablePage() {
  return <TableDisplay />
}
