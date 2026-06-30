import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'

import type { Route } from './+types/class-attendance.photos'

const SIGNED_URL_EXPIRY_SECONDS = 10 * 60

type PhotoRow = {
  id: string
  storage_bucket: string
  storage_path: string
  file_name: string | null
  mime_type: string | null
  byte_size: number | null
  uploaded_at: string
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return Response.json({ error: 'Unauthorized' }, { status: 403, headers: auth.headers })
  }

  const url = new URL(request.url)
  const classId = (url.searchParams.get('classId') ?? '').trim()
  const profileId = (url.searchParams.get('profileId') ?? '').trim()

  if (!classId || !profileId) {
    return Response.json({ error: 'Missing classId or profileId.' }, { status: 400, headers: auth.headers })
  }

  const { data, error } = await adminClient
    .from('class_attendance_photo' as any)
    .select('id, storage_bucket, storage_path, file_name, mime_type, byte_size, uploaded_at')
    .eq('class_id', classId)
    .eq('profile_id', profileId)
    .order('uploaded_at', { ascending: true })

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: auth.headers })
  }

  const rows = (data ?? []) as PhotoRow[]
  const photos = await Promise.all(
    rows.map(async row => {
      const { data: signed, error: signedError } = await adminClient
        .storage
        .from(row.storage_bucket)
        .createSignedUrl(row.storage_path, SIGNED_URL_EXPIRY_SECONDS)

      return {
        id: row.id,
        file_name: row.file_name,
        mime_type: row.mime_type,
        byte_size: row.byte_size,
        uploaded_at: row.uploaded_at,
        signed_url: signedError ? null : signed?.signedUrl ?? null,
        signed_url_error: signedError?.message ?? null,
      }
    })
  )

  return Response.json({ photos }, { headers: auth.headers })
}
