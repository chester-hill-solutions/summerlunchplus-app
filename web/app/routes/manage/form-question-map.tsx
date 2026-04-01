import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form-question-map')

export default function FormQuestionMapTablePage() {
  return <TableDisplay />
}
