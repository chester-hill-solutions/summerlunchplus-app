import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('workshop')
export const action = createTableAction('workshop')

export default function WorkshopTablePage() {
  return <TableDisplay />
}
