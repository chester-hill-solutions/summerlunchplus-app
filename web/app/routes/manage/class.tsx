import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('class')

export default function ClassTablePage() {
  return <TableDisplay />
}
