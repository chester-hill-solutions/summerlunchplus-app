import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('class-attendance-raw')
export const action = createTableAction('class-attendance-raw')

export default function ClassAttendanceRawTablePage() {
  return <TableDisplay />
}
