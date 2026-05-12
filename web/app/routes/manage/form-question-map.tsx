import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form-question-map')
export const action = createTableAction('form-question-map')

export default function FormQuestionMapTablePage() {
  return <TableDisplay />
}
