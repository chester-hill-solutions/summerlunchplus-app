import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('workshop')

export default function WorkshopTablePage() {
  return <TableDisplay />
}
