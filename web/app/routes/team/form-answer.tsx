import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form-answer')

export default function FormAnswersTablePage() {
  return <TableDisplay />
}
