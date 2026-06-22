import type { SupabaseClient } from '@supabase/supabase-js'

import { adminClient } from '@/lib/supabase/adminClient'

import type { ExportJobStatus } from './types'

type AnyClient = SupabaseClient<any>

export type ExportJobRecord = {
  id: string
  requested_by: string
  export_type: string
  source_table: string
  query_params: Record<string, unknown>
  filters: Record<string, unknown>
  sort: Record<string, unknown>
  column_order: string[]
  status: ExportJobStatus
  row_count: number | null
  file_size_bytes: number | null
  storage_bucket: string | null
  storage_path: string | null
  error_message: string | null
  attempt_count: number
  started_at: string | null
  completed_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export const createExportJob = async ({
  supabase,
  requestedBy,
  exportType,
  sourceTable,
  queryParams,
  filters,
  sort,
  columnOrder,
}: {
  supabase: AnyClient
  requestedBy: string
  exportType: string
  sourceTable: string
  queryParams: Record<string, unknown>
  filters: Record<string, unknown>
  sort: Record<string, unknown>
  columnOrder: string[]
}) => {
  const { data, error } = await (supabase.from('export_job' as any) as any)
    .insert({
      requested_by: requestedBy,
      export_type: exportType,
      source_table: sourceTable,
      query_params: queryParams,
      filters,
      sort,
      column_order: columnOrder,
      status: 'queued',
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to create export job.')
  }

  return data as ExportJobRecord
}

export const insertExportJobRows = async ({
  supabase,
  jobId,
  rows,
}: {
  supabase: AnyClient
  jobId: string
  rows: Array<Record<string, unknown>>
}) => {
  if (!rows.length) return
  const payload = rows.map((row, index) => ({
    job_id: jobId,
    row_index: index,
    row_data: row,
  }))

  const { error } = await (supabase.from('export_job_row' as any) as any).insert(payload)
  if (error) {
    throw new Error(error.message)
  }
}

export const listExportJobs = async ({
  supabase,
}: {
  supabase: AnyClient
}) => {
  const { data, error } = await (supabase.from('export_job' as any) as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as ExportJobRecord[]
}

export const getExportJobById = async ({
  supabase,
  jobId,
}: {
  supabase: AnyClient
  jobId: string
}) => {
  const { data, error } = await (supabase.from('export_job' as any) as any)
    .select('*')
    .eq('id', jobId)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Export job not found.')
  }

  return data as ExportJobRecord
}

export const claimNextExportJob = async () => {
  const { data, error } = await (adminClient.rpc('claim_next_export_job' as any) as any)
  if (error) {
    throw new Error(error.message)
  }
  if (!Array.isArray(data) || !data.length) return null
  return data[0] as ExportJobRecord
}

export const listExportJobRows = async ({ jobId }: { jobId: string }) => {
  const { data, error } = await (adminClient.from('export_job_row' as any) as any)
    .select('row_index, row_data')
    .eq('job_id', jobId)
    .order('row_index', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Array<{ row_index: number; row_data: Record<string, unknown> }>
}

export const completeExportJob = async ({
  jobId,
  rowCount,
  fileSizeBytes,
  storageBucket,
  storagePath,
  completedAt,
  expiresAt,
}: {
  jobId: string
  rowCount: number
  fileSizeBytes: number
  storageBucket: string
  storagePath: string
  completedAt: string
  expiresAt: string
}) => {
  const { error } = await (adminClient.from('export_job' as any) as any)
    .update({
      status: 'completed',
      row_count: rowCount,
      file_size_bytes: fileSizeBytes,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      completed_at: completedAt,
      expires_at: expiresAt,
      error_message: null,
    })
    .eq('id', jobId)

  if (error) {
    throw new Error(error.message)
  }
}

export const failExportJob = async ({
  jobId,
  errorMessage,
}: {
  jobId: string
  errorMessage: string
}) => {
  const { error } = await (adminClient.from('export_job' as any) as any)
    .update({
      status: 'failed',
      error_message: errorMessage,
    })
    .eq('id', jobId)

  if (error) {
    throw new Error(error.message)
  }
}

export const setExportJobStatus = async ({
  supabase,
  jobId,
  status,
}: {
  supabase: AnyClient
  jobId: string
  status: ExportJobStatus
}) => {
  const { error } = await (supabase.from('export_job' as any) as any)
    .update({ status })
    .eq('id', jobId)

  if (error) {
    throw new Error(error.message)
  }
}

export const createExportDownloadSignedUrl = async ({
  bucket,
  path,
  expiresIn,
}: {
  bucket: string
  path: string
  expiresIn: number
}) => {
  const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Unable to create download URL.')
  }
  return data.signedUrl
}

export const removeExportJobRows = async ({ jobId }: { jobId: string }) => {
  const { error } = await (adminClient.from('export_job_row' as any) as any)
    .delete()
    .eq('job_id', jobId)
  if (error) {
    throw new Error(error.message)
  }
}

export const failStaleRunningJobs = async ({
  olderThanMinutes,
}: {
  olderThanMinutes: number
}) => {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString()
  const { error } = await (adminClient.from('export_job' as any) as any)
    .update({
      status: 'failed',
      error_message: `Export runner watchdog marked stale running job after ${olderThanMinutes} minutes.`,
    })
    .eq('status', 'running')
    .lt('started_at', cutoff)

  if (error) {
    throw new Error(error.message)
  }
}

export const listExpiredCompletedExportJobs = async ({
  limit = 200,
}: {
  limit?: number
}) => {
  const nowIso = new Date().toISOString()
  const { data, error } = await (adminClient.from('export_job' as any) as any)
    .select('id, storage_bucket, storage_path')
    .eq('status', 'completed')
    .lte('expires_at', nowIso)
    .not('storage_bucket', 'is', null)
    .not('storage_path', 'is', null)
    .order('expires_at', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Array<{ id: string; storage_bucket: string; storage_path: string }>
}

export const markExportJobExpired = async ({ jobId }: { jobId: string }) => {
  const { error } = await (adminClient.from('export_job' as any) as any)
    .update({
      status: 'expired',
      error_message: null,
    })
    .eq('id', jobId)

  if (error) {
    throw new Error(error.message)
  }
}
