import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('email-message')

export default function EmailMessageTablePage() {
  return <TableDisplay />
}
