export type ExportJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'expired' | 'cancelled'

export const EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV = 'manage_workshop_enrollment_csv'
export const EXPORT_TYPE_FEDERAL_ELECTORAL_DISTRICT_CSV = 'manage_federal_electoral_district_csv'
export const EXPORT_TYPE_EMAIL_MESSAGE_CSV = 'manage_email_message_csv'
export const EXPORT_TYPE_CLASS_ATTENDANCE_CSV = 'manage_class_attendance_csv'
export const EXPORT_TYPE_FORM_ANSWER_CSV = 'manage_form_answer_csv'
export const EXPORT_TYPE_FORM_ID_ANSWERS_CSV = 'manage_form_id_answers_csv'

export type SupportedExportType =
  | typeof EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV
  | typeof EXPORT_TYPE_FEDERAL_ELECTORAL_DISTRICT_CSV
  | typeof EXPORT_TYPE_EMAIL_MESSAGE_CSV
  | typeof EXPORT_TYPE_CLASS_ATTENDANCE_CSV
  | typeof EXPORT_TYPE_FORM_ANSWER_CSV
  | typeof EXPORT_TYPE_FORM_ID_ANSWERS_CSV

export const EXPORT_STORAGE_BUCKET = 'manage-exports'
export const EXPORT_DEFAULT_TTL_DAYS = 7
export const EXPORT_MAX_ROWS = 100000
