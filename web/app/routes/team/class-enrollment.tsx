import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('class-enrollment')

export default function ClassEnrollmentPage() {
  return <TableDisplay />
}
