import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('semester-form-requirement')
export const action = createTableAction('semester-form-requirement')

export default function SemesterFormRequirementTablePage() {
  return <TableDisplay />
}
