import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('form-submission')

export default function FormSubmissionsTablePage() {
  return <TableDisplay />
}
