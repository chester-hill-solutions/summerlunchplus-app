import { adminClient } from '@/lib/supabase/adminClient'

export const tryAcquireZoomClassLock = async (classId: string) => {
  const { data, error } = await adminClient.rpc('zoom_try_advisory_lock', {
    p_lock_name: `zoom:class:${classId}`,
  })
  if (error) throw new Error(`Failed to acquire Zoom class lock: ${error.message}`)
  return data === true
}

export const releaseZoomClassLock = async (classId: string) => {
  const { data, error } = await adminClient.rpc('zoom_advisory_unlock', {
    p_lock_name: `zoom:class:${classId}`,
  })
  if (error) {
    console.error('[zoom-jobs][lock] unlock failed', { classId, error: error.message })
    return false
  }
  return data === true
}
