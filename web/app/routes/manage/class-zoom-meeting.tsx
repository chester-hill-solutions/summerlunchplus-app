import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('class-zoom-meeting')
export const action = createTableAction('class-zoom-meeting')

export default function ClassZoomMeetingTablePage() {
  return <TableDisplay />
}
