import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('discrepancies')

export default function DiscrepanciesTablePage() {
  return <TableDisplay />
}
