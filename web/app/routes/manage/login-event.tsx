import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('login-event')

export default function LoginEventTablePage() {
  return <TableDisplay />
}
