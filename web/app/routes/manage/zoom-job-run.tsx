import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('zoom-job-run')

export const action = createTableAction('zoom-job-run')

export default function ZoomJobRunTablePage() {
  return <TableDisplay />
}
