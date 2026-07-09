import { adminClient } from '@/lib/supabase/adminClient'

type AcquireZoomClassLockArgs = {
  classId: string
  ownerRunId: string
  ownerKind: string
  ttlSeconds: number
  ownerInstance?: string
  metadata?: Record<string, unknown>
}

type AcquireZoomClassLockResult = {
  acquired: boolean
  blockedByOwnerRunId: string | null
  blockedByOwnerKind: string | null
  blockedByOwnerInstance: string | null
  blockedExpiresAt: string | null
  ttlRemainingMs: number | null
}

type LockPayload = {
  acquired?: unknown
  blocked_by_owner_run_id?: unknown
  blocked_by_owner_kind?: unknown
  blocked_by_owner_instance?: unknown
  blocked_expires_at?: unknown
  ttl_remaining_ms?: unknown
}

const parseLockPayload = (payload: unknown): AcquireZoomClassLockResult => {
  const value = payload && typeof payload === 'object' ? (payload as LockPayload) : {}
  return {
    acquired: value.acquired === true,
    blockedByOwnerRunId:
      typeof value.blocked_by_owner_run_id === 'string' && value.blocked_by_owner_run_id.trim()
        ? value.blocked_by_owner_run_id
        : null,
    blockedByOwnerKind:
      typeof value.blocked_by_owner_kind === 'string' && value.blocked_by_owner_kind.trim()
        ? value.blocked_by_owner_kind
        : null,
    blockedByOwnerInstance:
      typeof value.blocked_by_owner_instance === 'string' && value.blocked_by_owner_instance.trim()
        ? value.blocked_by_owner_instance
        : null,
    blockedExpiresAt:
      typeof value.blocked_expires_at === 'string' && value.blocked_expires_at.trim()
        ? value.blocked_expires_at
        : null,
    ttlRemainingMs: typeof value.ttl_remaining_ms === 'number' ? value.ttl_remaining_ms : null,
  }
}

export const tryAcquireZoomClassLock = async ({
  classId,
  ownerRunId,
  ownerKind,
  ttlSeconds,
  ownerInstance,
  metadata,
}: AcquireZoomClassLockArgs): Promise<AcquireZoomClassLockResult> => {
  const { data, error } = await adminClient.rpc('zoom_lock_try_acquire', {
    p_lock_name: `zoom:class:${classId}`,
    p_owner_run_id: ownerRunId,
    p_owner_kind: ownerKind,
    p_ttl_seconds: ttlSeconds,
    p_metadata: metadata ?? {},
    p_owner_instance: ownerInstance ?? null,
  })
  if (error) throw new Error(`Failed to acquire Zoom class lock: ${error.message}`)
  return parseLockPayload(data)
}

export const releaseZoomClassLock = async ({ classId, ownerRunId }: { classId: string; ownerRunId: string }) => {
  const { data, error } = await adminClient.rpc('zoom_lock_release', {
    p_lock_name: `zoom:class:${classId}`,
    p_owner_run_id: ownerRunId,
  })
  if (error) {
    console.error('[zoom-jobs][lock] unlock failed', { classId, error: error.message })
    return false
  }

  if (data !== true) {
    console.warn('[zoom-jobs][lock] unlock returned false', { classId, ownerRunId })
  }

  return data === true
}
