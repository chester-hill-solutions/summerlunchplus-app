import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('federal-electoral-district')
export const action = createTableAction('federal-electoral-district')

export default function FederalElectoralDistrictTablePage() {
  return <TableDisplay />
}
