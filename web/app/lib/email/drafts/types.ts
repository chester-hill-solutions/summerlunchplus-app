import type { Json } from '@/lib/database.types'

export type EmailDraftChannel = 'transactional' | 'auth'

export type EmailDraftStatus = 'draft' | 'published' | 'archived'

export type EmailDraftSchema = {
  required?: string[]
  properties?: Record<string, { description?: string; example?: string }>
}

export type EmailDraftRecord = {
  id: string
  draft_key: string
  title: string
  description: string | null
  channel: EmailDraftChannel
  status: EmailDraftStatus
  is_system: boolean
  variables_schema: Json
  current_subject_markdown: string
  current_body_markdown: string
  published_version_id: string | null
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type EmailDraftVersionRecord = {
  id: string
  email_draft_id: string
  version_number: number
  subject_markdown: string
  body_markdown: string
  subject_rendered: string
  html_rendered: string
  text_rendered: string
  variables_schema: Json
  change_note: string | null
  created_by_user_id: string | null
  created_at: string
  published_at: string | null
  published_by_user_id: string | null
}

export type RenderDraftInput = {
  subjectMarkdown: string
  bodyMarkdown: string
  variables?: Record<string, unknown>
}

export type RenderDraftOutput = {
  subject: string
  html: string
  text: string
  missingVariables: string[]
}

export type ValidateDraftResult = {
  ok: boolean
  errors: string[]
}
