import {
  createEmailDraft,
  createEmailDraftVersion,
  getEmailDraftById,
  getEmailDraftByKey,
  getEmailDraftVersionById,
  getEmailDraftVersions,
  listEmailDrafts,
  setPublishedVersion,
  updateEmailDraft,
} from '@/lib/email/drafts/repository.server'
import { renderEmailDraft } from '@/lib/email/drafts/renderer.server'
import type {
  EmailDraftChannel,
  EmailDraftSchema,
  EmailDraftStatus,
} from '@/lib/email/drafts/types'
import { validateDraftForPublish } from '@/lib/email/drafts/validators'

export const listDrafts = listEmailDrafts

export const createDraft = async ({
  draftKey,
  title,
  triggerSummary,
  triggerEventKey,
  triggerOwner,
  channel,
  actorUserId,
}: {
  draftKey: string
  title: string
  triggerSummary: string
  triggerEventKey?: string | null
  triggerOwner?: string | null
  channel: EmailDraftChannel
  actorUserId: string
}) => {
  return createEmailDraft({
    draftKey,
    title,
    triggerSummary,
    triggerEventKey,
    triggerOwner,
    channel,
    actorUserId,
  })
}

export const getDraftForEditor = async (draftId: string) => {
  const [draft, versions] = await Promise.all([
    getEmailDraftById(draftId),
    getEmailDraftVersions(draftId),
  ])

  return { draft, versions }
}

export const saveDraft = async ({
  draftId,
  actorUserId,
  title,
  description,
  triggerSummary,
  triggerEventKey,
  triggerOwner,
  status,
  subjectMarkdown,
  bodyMarkdown,
  variablesSchema,
}: {
  draftId: string
  actorUserId: string
  title: string
  description: string | null
  triggerSummary: string
  triggerEventKey: string | null
  triggerOwner: string | null
  status: EmailDraftStatus
  subjectMarkdown: string
  bodyMarkdown: string
  variablesSchema: EmailDraftSchema
}) => {
  return updateEmailDraft({
    draftId,
    actorUserId,
    payload: {
      title,
      description,
      triggerSummary,
      triggerEventKey,
      triggerOwner,
      status,
      subjectMarkdown,
      bodyMarkdown,
      variablesSchema,
    },
  })
}

export const publishDraft = async ({
  draftId,
  actorUserId,
  changeNote,
}: {
  draftId: string
  actorUserId: string
  changeNote: string | null
}) => {
  const draft = await getEmailDraftById(draftId)
  const schema = (draft.variables_schema ?? {}) as EmailDraftSchema
  const validation = validateDraftForPublish({
    channel: draft.channel,
    triggerSummary: draft.trigger_summary,
    subjectMarkdown: draft.current_subject_markdown,
    bodyMarkdown: draft.current_body_markdown,
    variablesSchema: schema,
  })

  if (!validation.ok) {
    return { ok: false as const, errors: validation.errors }
  }

  const rendered = renderEmailDraft({
    subjectMarkdown: draft.current_subject_markdown,
    bodyMarkdown: draft.current_body_markdown,
  })

  const version = await createEmailDraftVersion({
    draftId,
    subjectMarkdown: draft.current_subject_markdown,
    bodyMarkdown: draft.current_body_markdown,
    subjectRendered: rendered.subject,
    htmlRendered: rendered.html,
    textRendered: rendered.text,
    variablesSchema: schema,
    changeNote,
    actorUserId,
  })

  await setPublishedVersion({
    draftId,
    versionId: version.id,
    actorUserId,
  })

  return { ok: true as const, version }
}

export const previewDraft = ({
  subjectMarkdown,
  bodyMarkdown,
  variables,
}: {
  subjectMarkdown: string
  bodyMarkdown: string
  variables?: Record<string, unknown>
}) => {
  return renderEmailDraft({ subjectMarkdown, bodyMarkdown, variables })
}

export const rollbackDraftToVersion = async ({
  draftId,
  versionId,
  actorUserId,
}: {
  draftId: string
  versionId: string
  actorUserId: string
}) => {
  const version = await getEmailDraftVersionById(versionId)
  if (version.email_draft_id !== draftId) {
    return { ok: false as const, error: 'Version does not belong to this draft.' }
  }

  await updateEmailDraft({
    draftId,
    actorUserId,
    payload: {
      status: 'draft',
      subjectMarkdown: version.subject_markdown,
      bodyMarkdown: version.body_markdown,
      variablesSchema: (version.variables_schema ?? {}) as EmailDraftSchema,
    },
  })

  return { ok: true as const }
}

export const resolvePublishedDraftByKey = async ({
  draftKey,
  variables,
}: {
  draftKey: string
  variables?: Record<string, unknown>
}) => {
  let draft

  try {
    draft = await getEmailDraftByKey(draftKey)
  } catch {
    return null
  }

  if (!draft.published_version_id) {
    return null
  }

  const version = await getEmailDraftVersionById(draft.published_version_id)
  return previewDraft({
    subjectMarkdown: version.subject_markdown,
    bodyMarkdown: version.body_markdown,
    variables,
  })
}
