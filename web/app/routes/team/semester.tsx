import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('semester')

export default function SemesterTablePage() {
  return <TableDisplay />
}
