import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { loadWorkshopEnrollmentEnrichment } from './workshop-enrollment-enrichment.server'

import type { Route } from './+types/workshop-enrollment.enrichment'

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const url = new URL(request.url)
  const profileIds = url.searchParams
    .getAll('profileId')
    .map(value => value.trim())
    .filter(Boolean)

  if (!profileIds.length) {
    return Response.json({ byProfileId: {} }, { headers: auth.headers })
  }

  const byProfileId = await loadWorkshopEnrollmentEnrichment(profileIds)
  return Response.json({ byProfileId }, { headers: auth.headers })
}
