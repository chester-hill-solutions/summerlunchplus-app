import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('ip-org-policy')
export const action = createTableAction('ip-org-policy')

export default function IpOrgPolicyTablePage() {
  return <TableDisplay />
}
