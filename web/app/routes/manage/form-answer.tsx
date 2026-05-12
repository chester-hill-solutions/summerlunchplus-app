import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form-answer')
export const action = createTableAction('form-answer')

export default function FormAnswersTablePage() {
  return <TableDisplay />
}
