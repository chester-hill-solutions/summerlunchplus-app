import { adminClient } from '@/lib/supabase/adminClient'

import { listExpiredCompletedExportJobs, markExportJobExpired } from './repository.server'

export const cleanupExpiredExports = async () => {
  const jobs = await listExpiredCompletedExportJobs({ limit: 200 })
  if (!jobs.length) {
    return { cleaned: 0 }
  }

  let cleaned = 0
  for (const job of jobs) {
    const { error } = await adminClient.storage.from(job.storage_bucket).remove([job.storage_path])
    if (error) {
      console.error('[exports] cleanup remove failed', {
        jobId: job.id,
        bucket: job.storage_bucket,
        path: job.storage_path,
        error: error.message,
      })
      continue
    }

    await markExportJobExpired({ jobId: job.id })
    cleaned += 1
  }

  return { cleaned }
}
