import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form')

export default function FormsTablePage() {
  return <TableDisplay />
}
