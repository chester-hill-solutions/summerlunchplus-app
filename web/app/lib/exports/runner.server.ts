import { buildCsv } from './csv.server'
import {
  claimNextExportJob,
  completeExportJob,
  failExportJob,
  listExportJobRows,
} from './repository.server'
import {
  EXPORT_DEFAULT_TTL_DAYS,
  EXPORT_STORAGE_BUCKET,
  EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV,
} from './types'
import { materializeWorkshopEnrollmentExportRows } from './workshop-enrollment-export-row.server'
import { adminClient } from '@/lib/supabase/adminClient'

const buildStoragePath = ({ requestedBy, jobId }: { requestedBy: string; jobId: string }) =>
  `exports/${requestedBy}/${jobId}.csv`

export const processNextExportJob = async () => {
  const job = await claimNextExportJob()
  if (!job) {
    return { processed: false as const }
  }

  try {
    if (job.export_type !== EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV) {
      throw new Error(`Unsupported export type: ${job.export_type}`)
    }

    const rows = await listExportJobRows({ jobId: job.id })
    const columns = Array.isArray(job.column_order) ? job.column_order : []
    const csvRows =
      job.export_type === EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV
        ? await materializeWorkshopEnrollmentExportRows({
            rows: rows.map(row => row.row_data),
            columns,
          })
        : rows.map(row => row.row_data)
    const csv = buildCsv({ columns, rows: csvRows })
    const bytes = new TextEncoder().encode(csv)
    const storagePath = buildStoragePath({ requestedBy: job.requested_by, jobId: job.id })

    const { error: uploadError } = await adminClient.storage
      .from(EXPORT_STORAGE_BUCKET)
      .upload(storagePath, bytes, {
        contentType: 'text/csv; charset=utf-8',
        upsert: true,
      })

    if (uploadError) {
      throw new Error(uploadError.message)
    }

    const completedAt = new Date()
    const expiresAt = new Date(completedAt)
    expiresAt.setDate(expiresAt.getDate() + EXPORT_DEFAULT_TTL_DAYS)

    await completeExportJob({
      jobId: job.id,
      rowCount: csvRows.length,
      fileSizeBytes: bytes.byteLength,
      storageBucket: EXPORT_STORAGE_BUCKET,
      storagePath,
      completedAt: completedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })

    return { processed: true as const, jobId: job.id }
  } catch (error) {
    await failExportJob({
      jobId: job.id,
      errorMessage: error instanceof Error ? error.message : 'Unknown export processing error',
    })
    return { processed: true as const, jobId: job.id, failed: true as const }
  }
}
