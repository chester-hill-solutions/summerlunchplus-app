import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('person-parent')

export default function PersonParentTablePage() {
  return <TableDisplay />
}
