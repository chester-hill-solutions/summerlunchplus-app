import { adminClient } from '@/lib/supabase/adminClient'
import type {
  EmailDraftChannel,
  EmailDraftRecord,
  EmailDraftSchema,
  EmailDraftStatus,
  EmailDraftVersionRecord,
} from '@/lib/email/drafts/types'

type DraftListFilters = {
  channel?: EmailDraftChannel | 'all'
  status?: EmailDraftStatus | 'all'
}

export const listEmailDrafts = async (filters: DraftListFilters = {}) => {
  let query = adminClient
    .from('email_draft')
    .select(
      'id, draft_key, title, description, channel, status, is_system, variables_schema, current_subject_markdown, current_body_markdown, published_version_id, created_by_user_id, updated_by_user_id, created_at, updated_at'
    )
    .order('updated_at', { ascending: false })

  if (filters.channel && filters.channel !== 'all') {
    query = query.eq('channel', filters.channel)
  }

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as EmailDraftRecord[]
}

export const createEmailDraft = async ({
  draftKey,
  title,
  channel,
  actorUserId,
}: {
  draftKey: string
  title: string
  channel: EmailDraftChannel
  actorUserId: string
}) => {
  const { data, error } = await adminClient
    .from('email_draft')
    .insert({
      draft_key: draftKey,
      title,
      channel,
      created_by_user_id: actorUserId,
      updated_by_user_id: actorUserId,
    })
    .select(
      'id, draft_key, title, description, channel, status, is_system, variables_schema, current_subject_markdown, current_body_markdown, published_version_id, created_by_user_id, updated_by_user_id, created_at, updated_at'
    )
    .single()

  if (error) throw new Error(error.message)
  return data as EmailDraftRecord
}

export const getEmailDraftById = async (draftId: string) => {
  const { data, error } = await adminClient
    .from('email_draft')
    .select(
      'id, draft_key, title, description, channel, status, is_system, variables_schema, current_subject_markdown, current_body_markdown, published_version_id, created_by_user_id, updated_by_user_id, created_at, updated_at'
    )
    .eq('id', draftId)
    .single()

  if (error) throw new Error(error.message)
  return data as EmailDraftRecord
}

export const getEmailDraftByKey = async (draftKey: string) => {
  const { data, error } = await adminClient
    .from('email_draft')
    .select(
      'id, draft_key, title, description, channel, status, is_system, variables_schema, current_subject_markdown, current_body_markdown, published_version_id, created_by_user_id, updated_by_user_id, created_at, updated_at'
    )
    .eq('draft_key', draftKey)
    .single()

  if (error) throw new Error(error.message)
  return data as EmailDraftRecord
}

export const getEmailDraftVersions = async (draftId: string) => {
  const { data, error } = await adminClient
    .from('email_draft_version')
    .select(
      'id, email_draft_id, version_number, subject_markdown, body_markdown, subject_rendered, html_rendered, text_rendered, variables_schema, change_note, created_by_user_id, created_at, published_at, published_by_user_id'
    )
    .eq('email_draft_id', draftId)
    .order('version_number', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as EmailDraftVersionRecord[]
}

export const updateEmailDraft = async ({
  draftId,
  actorUserId,
  payload,
}: {
  draftId: string
  actorUserId: string
  payload: {
    title?: string
    description?: string | null
    status?: EmailDraftStatus
    subjectMarkdown?: string
    bodyMarkdown?: string
    variablesSchema?: EmailDraftSchema
  }
}) => {
  const updatePayload: Record<string, unknown> = {
    updated_by_user_id: actorUserId,
  }

  if (typeof payload.title === 'string') updatePayload.title = payload.title
  if (payload.description !== undefined) updatePayload.description = payload.description
  if (payload.status) updatePayload.status = payload.status
  if (typeof payload.subjectMarkdown === 'string') {
    updatePayload.current_subject_markdown = payload.subjectMarkdown
  }
  if (typeof payload.bodyMarkdown === 'string') {
    updatePayload.current_body_markdown = payload.bodyMarkdown
  }
  if (payload.variablesSchema !== undefined) {
    updatePayload.variables_schema = payload.variablesSchema
  }

  const { data, error } = await adminClient
    .from('email_draft')
    .update(updatePayload)
    .eq('id', draftId)
    .select(
      'id, draft_key, title, description, channel, status, is_system, variables_schema, current_subject_markdown, current_body_markdown, published_version_id, created_by_user_id, updated_by_user_id, created_at, updated_at'
    )
    .single()

  if (error) throw new Error(error.message)
  return data as EmailDraftRecord
}

export const createEmailDraftVersion = async ({
  draftId,
  subjectMarkdown,
  bodyMarkdown,
  subjectRendered,
  htmlRendered,
  textRendered,
  variablesSchema,
  changeNote,
  actorUserId,
}: {
  draftId: string
  subjectMarkdown: string
  bodyMarkdown: string
  subjectRendered: string
  htmlRendered: string
  textRendered: string
  variablesSchema: EmailDraftSchema
  changeNote: string | null
  actorUserId: string
}) => {
  const { data: versionRow, error: versionError } = await adminClient
    .from('email_draft_version')
    .select('version_number')
    .eq('email_draft_id', draftId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (versionError) throw new Error(versionError.message)

  const nextVersion = (versionRow?.version_number ?? 0) + 1

  const { data, error } = await adminClient
    .from('email_draft_version')
    .insert({
      email_draft_id: draftId,
      version_number: nextVersion,
      subject_markdown: subjectMarkdown,
      body_markdown: bodyMarkdown,
      subject_rendered: subjectRendered,
      html_rendered: htmlRendered,
      text_rendered: textRendered,
      variables_schema: variablesSchema,
      change_note: changeNote,
      created_by_user_id: actorUserId,
      published_at: new Date().toISOString(),
      published_by_user_id: actorUserId,
    })
    .select(
      'id, email_draft_id, version_number, subject_markdown, body_markdown, subject_rendered, html_rendered, text_rendered, variables_schema, change_note, created_by_user_id, created_at, published_at, published_by_user_id'
    )
    .single()

  if (error) throw new Error(error.message)
  return data as EmailDraftVersionRecord
}

export const setPublishedVersion = async ({
  draftId,
  versionId,
  actorUserId,
}: {
  draftId: string
  versionId: string
  actorUserId: string
}) => {
  const { data, error } = await adminClient
    .from('email_draft')
    .update({
      status: 'published',
      published_version_id: versionId,
      updated_by_user_id: actorUserId,
    })
    .eq('id', draftId)
    .select(
      'id, draft_key, title, description, channel, status, is_system, variables_schema, current_subject_markdown, current_body_markdown, published_version_id, created_by_user_id, updated_by_user_id, created_at, updated_at'
    )
    .single()

  if (error) throw new Error(error.message)
  return data as EmailDraftRecord
}

export const getEmailDraftVersionById = async (versionId: string) => {
  const { data, error } = await adminClient
    .from('email_draft_version')
    .select(
      'id, email_draft_id, version_number, subject_markdown, body_markdown, subject_rendered, html_rendered, text_rendered, variables_schema, change_note, created_by_user_id, created_at, published_at, published_by_user_id'
    )
    .eq('id', versionId)
    .single()

  if (error) throw new Error(error.message)
  return data as EmailDraftVersionRecord
}
