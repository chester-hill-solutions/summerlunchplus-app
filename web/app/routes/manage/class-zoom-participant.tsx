import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('class-zoom-participant')
export const action = createTableAction('class-zoom-participant')

export default function ClassZoomParticipantTablePage() {
  return <TableDisplay />
}
