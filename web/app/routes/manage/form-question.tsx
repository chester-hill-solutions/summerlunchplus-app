import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form-question')
export const action = createTableAction('form-question')

export default function FormQuestionsTablePage() {
  return <TableDisplay />
}
