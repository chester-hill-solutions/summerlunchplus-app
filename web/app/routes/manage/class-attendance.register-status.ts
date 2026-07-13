import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'

import type { Route } from './+types/class-attendance.register-status'

type AttemptRow = {
  status: string
  error_message: string | null
  result_payload: Record<string, unknown> | null
  error_payload: Record<string, unknown> | null
  created_at: string
}

const skipReasonFromPayload = (payload: Record<string, unknown> | null) => {
  if (!payload) return ''
  const reason = payload.reason
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  const skipReason = payload.skipReason
  if (typeof skipReason === 'string' && skipReason.trim()) return skipReason.trim()
  return ''
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return Response.json({ message: 'Unauthorized' }, { status: 403, headers: auth.headers })
  }

  const url = new URL(request.url)
  const classId = (url.searchParams.get('classId') ?? '').trim()
  const profileId = (url.searchParams.get('profileId') ?? '').trim()

  if (!classId || !profileId) {
    return Response.json(
      {
        state: 'no_attempt',
        message: 'Missing class or profile id.',
        detail: 'Cannot check registration attempts without class and profile IDs.',
        attemptedAt: null,
      },
      { headers: auth.headers }
    )
  }

  const { data, error } = await adminClient
    .from('zoom_job_attempt')
    .select('status, error_message, result_payload, error_payload, created_at')
    .eq('class_id', classId)
    .eq('profile_id', profileId)
    .in('action_type', ['registrant_register', 'class_provision'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<AttemptRow>()

  if (error) {
    return Response.json(
      {
        state: 'attempt_found',
        message: 'Failed to load recent attempt.',
        detail: error.message,
        attemptedAt: null,
      },
      { headers: auth.headers }
    )
  }

  if (!data) {
    return Response.json(
      {
        state: 'no_attempt',
        message: 'No registration attempt recorded yet.',
        detail: 'No per-student registration attempt exists for this class/profile pair.',
        attemptedAt: null,
      },
      { headers: auth.headers }
    )
  }

  if (data.status === 'failed') {
    return Response.json(
      {
        state: 'attempt_found',
        message: 'Last registration attempt failed.',
        detail: data.error_message ?? 'No error message was recorded.',
        attemptedAt: data.created_at,
      },
      { headers: auth.headers }
    )
  }

  if (data.status === 'skipped') {
    const skipReason = skipReasonFromPayload(data.result_payload)
    return Response.json(
      {
        state: 'attempt_found',
        message: 'Last registration attempt was skipped.',
        detail: skipReason || data.error_message || 'No skip reason was recorded.',
        attemptedAt: data.created_at,
      },
      { headers: auth.headers }
    )
  }

  if (data.status === 'succeeded') {
    return Response.json(
      {
        state: 'attempt_found',
        message: 'Last registration attempt succeeded.',
        detail: 'A successful attempt exists, but this row still has no join link.',
        attemptedAt: data.created_at,
      },
      { headers: auth.headers }
    )
  }

  return Response.json(
    {
      state: 'attempt_found',
      message: 'Registration attempt is in progress or pending.',
      detail: data.error_message ?? 'Most recent attempt has not completed yet.',
      attemptedAt: data.created_at,
    },
    { headers: auth.headers }
  )
}
