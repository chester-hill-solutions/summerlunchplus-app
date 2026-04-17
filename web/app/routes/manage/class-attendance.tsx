import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import type { Route } from './+types/class-attendance'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class-attendance')

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

  const classId = formData.get('class_id') as string
  const profileId = formData.get('profile_id') as string
  const status = (formData.get('status') as string | null) ?? null
  if (!classId || !profileId) {
    return new Response('Missing identifiers', { status: 400, headers: auth.headers })
  }

  const { supabase } = createClient(request)
  const { error } = await supabase
    .from('class_attendance')
    .update({ status: status || null, recorded_by: auth.user.id })
    .eq('class_id', classId)
    .eq('profile_id', profileId)

  if (error) {
    return new Response(error.message, { status: 500, headers: auth.headers })
  }

  return { ok: true }
}

export default function ClassAttendanceTablePage() {
  return <TableDisplay />
}
