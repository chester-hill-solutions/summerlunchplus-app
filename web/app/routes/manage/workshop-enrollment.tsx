import { requireAuth } from '@/lib/auth.server'
import { Constants, type Database } from '@/lib/database.types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/workshop-enrollment'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class-enrollment')

export async function loader(args: Route.LoaderArgs) {
  const auth = await requireAuth(args.request)
  const base = await baseLoader(args)
  return {
    ...base,
    canEditStatus: isRoleAtLeast(auth.claims.role, 'staff'),
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const intent = formData.get('intent') as string | null
  if (intent !== 'update-status') {
    return new Response('Unsupported action', { status: 400, headers: auth.headers })
  }

  const enrollmentId = formData.get('enrollment_id') as string
  const status = formData.get('status') as string | null
  if (!enrollmentId || !status) {
    return new Response('Missing enrollment data', { status: 400, headers: auth.headers })
  }

  if (
    !Constants.public.Enums.workshop_enrollment_status.includes(
      status as Database['public']['Enums']['workshop_enrollment_status']
    )
  ) {
    return new Response('Invalid status', { status: 400, headers: auth.headers })
  }

  const { supabase } = createClient(request)
  const { error } = await supabase
    .from('workshop_enrollment')
    .update({ status, decided_by: auth.user.id })
    .eq('id', enrollmentId)

  if (error) {
    return new Response(error.message, { status: 500, headers: auth.headers })
  }

  return { ok: true }
}

export default function WorkshopEnrollmentPage() {
  return <TableDisplay />
}
