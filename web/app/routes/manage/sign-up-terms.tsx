import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('sign-up-terms')
export const action = createTableAction('sign-up-terms')

export default function SignUpTermsTablePage() {
  return <TableDisplay />
}
