import { redirect } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'

import type { Route } from './+types/invites'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('invites')

export async function loader(args: Route.LoaderArgs) {
  const auth = await requireAuth(args.request)
  if (!isRoleAtLeast(auth.claims.role, 'manager')) {
    throw redirect('/manage/team', { headers: auth.headers })
  }

  return baseLoader(args)
}

export default function InvitesTablePage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Managers and admins can review all invite records. Send team invites from the Team page.
      </p>
      <TableDisplay />
    </div>
  )
}
