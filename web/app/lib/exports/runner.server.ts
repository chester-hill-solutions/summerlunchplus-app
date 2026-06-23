import { buildCsv } from './csv.server'
import {
  claimExportJobById,
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

const WORKSHOP_PROFILE_SPLIT_COLUMNS = [
  'student_firstname',
  'student_lastname',
  'student_email',
  'guardian_firstname',
  'guardian_lastname',
  'guardian_email',
] as const

const normalizeWorkshopExportColumns = (columns: string[]) => {
  if (!columns.includes('profile_display')) {
    return columns
  }

  return columns.flatMap(column =>
    column === 'profile_display' ? ['profile_display', ...WORKSHOP_PROFILE_SPLIT_COLUMNS] : [column]
  )
}

const buildStoragePath = ({ requestedBy, jobId }: { requestedBy: string; jobId: string }) =>
  `exports/${requestedBy}/${jobId}.csv`

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const listExportJobRowsWithRetry = async ({
  jobId,
  attempts = 5,
  delayMs = 250,
}: {
  jobId: string
  attempts?: number
  delayMs?: number
}) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const rows = await listExportJobRows({ jobId })
    if (rows.length > 0 || attempt === attempts) {
      return rows
    }
    await sleep(delayMs)
  }

  return []
}

export const processNextExportJob = async () => {
  const job = await claimNextExportJob()
  if (!job) {
    return { processed: false as const }
  }

  return processClaimedExportJob(job)
}

export const processExportJobById = async ({ jobId }: { jobId: string }) => {
  const job = await claimExportJobById({ jobId })
  if (!job) {
    return { processed: false as const }
  }

  return processClaimedExportJob(job)
}

const processClaimedExportJob = async (job: {
  id: string
  export_type: string
  column_order: string[] | null
  requested_by: string
}) => {

  try {
    if (job.export_type !== EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV) {
      throw new Error(`Unsupported export type: ${job.export_type}`)
    }

    const rows = await listExportJobRowsWithRetry({ jobId: job.id })
    const requestedColumns = Array.isArray(job.column_order) ? job.column_order : []
    const columns =
      job.export_type === EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV
        ? normalizeWorkshopExportColumns(requestedColumns)
        : requestedColumns
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
