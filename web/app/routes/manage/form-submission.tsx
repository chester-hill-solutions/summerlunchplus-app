import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form-submission')
export const action = createTableAction('form-submission')

export default function FormSubmissionsTablePage() {
  return <TableDisplay />
}
