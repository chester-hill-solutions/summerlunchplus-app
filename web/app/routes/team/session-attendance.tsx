import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('session-attendance')

export default function SessionAttendanceTablePage() {
  return <TableDisplay />
}
