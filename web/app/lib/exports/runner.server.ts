import { buildCsv } from './csv.server'
import {
  claimExportJobById,
  claimNextExportJob,
  completeExportJob,
  failExportJob,
  listExportJobRows,
} from './repository.server'
import {
  EXPORT_TYPE_CLASS_ATTENDANCE_CSV,
  EXPORT_TYPE_EMAIL_MESSAGE_CSV,
  EXPORT_TYPE_FEDERAL_ELECTORAL_DISTRICT_CSV,
  EXPORT_DEFAULT_TTL_DAYS,
  EXPORT_STORAGE_BUCKET,
  EXPORT_TYPE_FORM_ANSWER_CSV,
  EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV,
} from './types'
import { materializeWorkshopEnrollmentExportRows } from './workshop-enrollment-export-row.server'
import { adminClient } from '@/lib/supabase/adminClient'

const WORKSHOP_PROFILE_SPLIT_COLUMNS = [
  'student_firstname',
  'student_lastname',
  'student_email',
  'student_phone',
  'guardian_firstname',
  'guardian_lastname',
  'guardian_email',
  'guardian_phone',
] as const

const SUPPORTED_EXPORT_TYPES = new Set([
  EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV,
  EXPORT_TYPE_FEDERAL_ELECTORAL_DISTRICT_CSV,
  EXPORT_TYPE_EMAIL_MESSAGE_CSV,
  EXPORT_TYPE_CLASS_ATTENDANCE_CSV,
  EXPORT_TYPE_FORM_ANSWER_CSV,
])

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

const shouldLogExportRunnerProfile = () =>
  process.env.NODE_ENV !== 'production' ||
  process.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true' ||
  process.env.EXPORT_PROFILE_ENABLED === 'true'

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
  const startedAt = Date.now()
  let checkpointAt = startedAt
  const checkpoints: Array<{ step: string; durationMs: number; extra?: Record<string, unknown> }> = []
  const mark = (step: string, extra?: Record<string, unknown>) => {
    const now = Date.now()
    checkpoints.push({
      step,
      durationMs: now - checkpointAt,
      extra,
    })
    checkpointAt = now
  }

  const complete = (status: 'completed' | 'failed', extra?: Record<string, unknown>) => {
    if (!shouldLogExportRunnerProfile()) return
    console.info('[export-runner-profile]', {
      event: 'process_export_job_complete',
      jobId: job.id,
      exportType: job.export_type,
      status,
      totalDurationMs: Date.now() - startedAt,
      checkpoints,
      ...extra,
    })
  }

  try {
    if (!SUPPORTED_EXPORT_TYPES.has(job.export_type)) {
      throw new Error(`Unsupported export type: ${job.export_type}`)
    }
    mark('validate_export_type')

    const rows = await listExportJobRowsWithRetry({ jobId: job.id })
    mark('load_export_rows', { rowCount: rows.length })
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
    mark('materialize_rows', {
      rowCount: csvRows.length,
      columnCount: columns.length,
    })
    const csv = buildCsv({ columns, rows: csvRows })
    const bytes = new TextEncoder().encode(csv)
    const storagePath = buildStoragePath({ requestedBy: job.requested_by, jobId: job.id })
    mark('build_csv_bytes', {
      bytes: bytes.byteLength,
    })

    const { error: uploadError } = await adminClient.storage
      .from(EXPORT_STORAGE_BUCKET)
      .upload(storagePath, bytes, {
        contentType: 'text/csv; charset=utf-8',
        upsert: true,
      })

    if (uploadError) {
      throw new Error(uploadError.message)
    }
    mark('upload_csv', {
      storagePath,
    })

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
    mark('complete_export_job')

    complete('completed', {
      rowCount: csvRows.length,
      fileSizeBytes: bytes.byteLength,
      storagePath,
    })

    return { processed: true as const, jobId: job.id }
  } catch (error) {
    await failExportJob({
      jobId: job.id,
      errorMessage: error instanceof Error ? error.message : 'Unknown export processing error',
    })
    mark('fail_export_job', {
      error: error instanceof Error ? error.message : String(error),
    })
    complete('failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { processed: true as const, jobId: job.id, failed: true as const }
  }
}
