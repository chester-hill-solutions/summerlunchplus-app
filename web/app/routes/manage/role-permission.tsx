import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('role-permission')

export default function RolePermissionsTablePage() {
  return <TableDisplay />
}
