import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form-assignment')
export const action = createTableAction('form-assignment')

export default function FormAssignmentsTablePage() {
  return <TableDisplay />
}
