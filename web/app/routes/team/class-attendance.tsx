import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('class-attendance')

export default function ClassAttendanceTablePage() {
  return <TableDisplay />
}
