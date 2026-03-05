import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('invites')

export default function InvitesTablePage() {
  return <TableDisplay />
}
