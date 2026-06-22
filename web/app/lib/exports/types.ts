export type ExportJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'expired' | 'cancelled'

export const EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV = 'manage_workshop_enrollment_csv'

export type SupportedExportType = typeof EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV

export const EXPORT_STORAGE_BUCKET = 'manage-exports'
export const EXPORT_DEFAULT_TTL_DAYS = 7
export const EXPORT_MAX_ROWS = 100000
