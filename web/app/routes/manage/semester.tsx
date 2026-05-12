import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('semester')
export const action = createTableAction('semester')

export default function SemesterTablePage() {
  return <TableDisplay />
}
