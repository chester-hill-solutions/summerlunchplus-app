import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('zoom-job-attempt')

export const action = createTableAction('zoom-job-attempt')

export default function ZoomJobAttemptTablePage() {
  return <TableDisplay />
}
