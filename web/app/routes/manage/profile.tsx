import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('profile')

export default function ProfileTablePage() {
  return <TableDisplay />
}
