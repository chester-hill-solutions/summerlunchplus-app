import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'

import {
  loadClassAttendanceEnrichment,
  type ClassAttendanceEnrichmentLane,
} from './class-attendance-enrichment.server'

import type { Route } from './+types/class-attendance.enrichment'

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
  const requestedLanes = url.searchParams
    .getAll('lane')
    .map(value => value.trim())
    .filter((value): value is ClassAttendanceEnrichmentLane =>
      value === 'giftcard' || value === 'geo' || value === 'family'
    )

  if (!profileIds.length) {
    return Response.json({ byProfileId: {} }, { headers: auth.headers })
  }

  const byProfileId = await loadClassAttendanceEnrichment(profileIds, {
    lanes: requestedLanes.length ? requestedLanes : undefined,
  })
  return Response.json({ byProfileId }, { headers: auth.headers })
}
