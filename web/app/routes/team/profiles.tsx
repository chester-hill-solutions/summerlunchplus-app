import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('profiles')

export default function ProfilesTablePage() {
  return <TableDisplay />
}
