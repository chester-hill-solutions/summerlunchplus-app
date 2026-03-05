import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('session')

export default function SessionsTablePage() {
  return <TableDisplay />
}
