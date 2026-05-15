import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('sign-up-terms-consent')

export default function SignUpTermsConsentTablePage() {
  return <TableDisplay />
}
