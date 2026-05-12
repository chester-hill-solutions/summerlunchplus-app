import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('person-guardian-child')

export default function FamiliesTablePage() {
  return <TableDisplay />
}
