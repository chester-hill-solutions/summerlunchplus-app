import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form-assignment')

export default function FormAssignmentsTablePage() {
  return <TableDisplay />
}
