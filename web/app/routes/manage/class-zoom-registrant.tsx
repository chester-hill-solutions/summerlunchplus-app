import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('class-zoom-registrant')
export const action = createTableAction('class-zoom-registrant')

export default function ClassZoomRegistrantTablePage() {
  return <TableDisplay />
}
