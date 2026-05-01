
import type { Route } from './+types/protected'
import { redirect } from 'react-router'

import { enforceOnboardingGuard } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'

export const loader = async ({ request }: Route.LoaderArgs) => {
  const auth = await enforceOnboardingGuard(request)
  throw redirect(isRoleAtLeast(auth.claims.role, 'instructor') ? '/manage' : '/home', { headers: auth.headers })
}

export default function ProtectedPage() {
  return null
}
