import { requireAuth } from '@/lib/auth.server'
import { loadGiftCardAllocationForecastSnapshot } from '@/lib/gift-cards/forecast.server'
import { isRoleAtLeast } from '@/lib/roles'

import type { Route } from './+types/gift-cards.stats-data'

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) throw new Response('Forbidden', { status: 403 })
  return loadGiftCardAllocationForecastSnapshot()
}
