import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('user-roles')

export default function UserRolesTablePage() {
  return <TableDisplay />
}
