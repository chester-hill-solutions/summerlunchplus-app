import type { Json } from '@/lib/database.types'
import { resolvePublishedDraftByKey } from '@/lib/email/drafts/service.server'
import {
  compareRenderedEmail,
  parseTemplateMigrationMode,
  type TemplateMigrationMode,
} from '@/lib/email/migration'
import {
  emailTemplates,
  type EmailTemplateKey,
  type EmailTemplateMap,
} from '@/lib/email/templates'
import { adminClient } from '@/lib/supabase/adminClient'

type SendTransactionalEmailArgs = {
  toEmail: string
  subject: string
  html: string
  text: string
  templateKey: string
  templateData: Json
  eventKey?: string | null
  triggeredByUserId?: string | null
  recipientUserId?: string | null
  profileId?: string | null
  familyProfileId?: string | null
  workshopEnrollmentId?: string | null
}

type SendTemplateEmailArgs<K extends EmailTemplateKey> = {
  toEmail: string
  templateKey: K
  templateData: EmailTemplateMap[K]
  eventKey?: string | null
  triggeredByUserId?: string | null
  recipientUserId?: string | null
  profileId?: string | null
  familyProfileId?: string | null
  workshopEnrollmentId?: string | null
}

type SendTransactionalEmailResult = {
  status: 'sent' | 'failed' | 'skipped'
  id: string | null
  error: string | null
}

const TEMPLATE_FALLBACK_POLICY =
  (process.env.EMAIL_DRAFT_FALLBACK_POLICY === 'fail-closed'
    ? 'fail-closed'
    : 'fallback-legacy') as 'fallback-legacy' | 'fail-closed'

const normalizeTemplateVariables = (value: Json): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const withMigrationMeta = ({
  templateData,
  mode,
  source,
  parity,
  fallbackApplied,
  fallbackReason,
}: {
  templateData: Json
  mode: TemplateMigrationMode
  source: 'legacy' | 'draft'
  parity?: {
    matched: boolean
    subjectMatch: boolean
    textMatch: boolean
    htmlMatch: boolean
  }
  fallbackApplied?: boolean
  fallbackReason?: string
}): Json => {
  if (!templateData || typeof templateData !== 'object' || Array.isArray(templateData)) {
    return templateData
  }

  const payload = templateData as Record<string, unknown>
  return {
    ...payload,
    _migration_mode: mode,
    _template_source: source,
    ...(parity ? { _parity_check: parity } : {}),
    ...(fallbackApplied ? { _fallback_applied: true } : {}),
    ...(fallbackReason ? { _fallback_reason: fallbackReason } : {}),
  }
}

const renderLegacyTemplate = <K extends EmailTemplateKey>(templateKey: K, templateData: EmailTemplateMap[K]) =>
  emailTemplates[templateKey].render(templateData)

export const sendTransactionalEmail = async ({
  toEmail,
  subject,
  html,
  text,
  templateKey,
  templateData,
  eventKey,
  triggeredByUserId,
  recipientUserId,
  profileId,
  familyProfileId,
  workshopEnrollmentId,
}: SendTransactionalEmailArgs): Promise<SendTransactionalEmailResult> => {
  const normalizedEmail = toEmail.trim().toLowerCase()

  if (eventKey) {
    const { data: existing, error: existingError } = await adminClient
      .from('email_message')
      .select('id')
      .eq('event_key', eventKey)
      .eq('to_email', normalizedEmail)
      .maybeSingle()

    if (!existingError && existing?.id) {
      return { status: 'skipped', id: existing.id, error: null }
    }
  }

  const { data: queuedRow, error: queueError } = await adminClient
    .from('email_message')
    .insert({
      to_email: normalizedEmail,
      subject,
      template_key: templateKey,
      template_data: templateData,
      provider: 'resend',
      status: 'queued',
      event_key: eventKey ?? null,
      triggered_by_user_id: triggeredByUserId ?? null,
      recipient_user_id: recipientUserId ?? null,
      profile_id: profileId ?? null,
      family_profile_id: familyProfileId ?? null,
      workshop_enrollment_id: workshopEnrollmentId ?? null,
    })
    .select('id')
    .single()

  if (queueError) {
    if (queueError.code === '23505') {
      return { status: 'skipped', id: null, error: null }
    }

    console.error('[email] failed to queue', queueError)
    return { status: 'failed', id: null, error: queueError.message }
  }

  const messageId = queuedRow.id
  const resendApiKey = process.env.RESEND_API_KEY ?? process.env.SMTP_API_KEY
  const from = process.env.EMAIL_FROM ?? 'SummerLunch Plus <hub@summerlunchplus.com>'

  if (!resendApiKey) {
    const errorMessage = 'Missing RESEND_API_KEY (or SMTP_API_KEY fallback)'

    await adminClient
      .from('email_message')
      .update({
        status: 'failed',
        error_message: errorMessage,
        failed_at: new Date().toISOString(),
      })
      .eq('id', messageId)

    return { status: 'failed', id: messageId, error: errorMessage }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [normalizedEmail],
      subject,
      html,
      text,
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const errorMessage =
      typeof payload?.message === 'string'
        ? payload.message
        : `Resend request failed with status ${response.status}`

    await adminClient
      .from('email_message')
      .update({
        status: 'failed',
        error_message: errorMessage,
        failed_at: new Date().toISOString(),
      })
      .eq('id', messageId)

    return { status: 'failed', id: messageId, error: errorMessage }
  }

  const providerMessageId = typeof payload?.id === 'string' ? payload.id : null

  await adminClient
    .from('email_message')
    .update({
      status: 'sent',
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
      error_message: null,
      failed_at: null,
    })
    .eq('id', messageId)

  return { status: 'sent', id: messageId, error: null }
}

export const sendTemplateEmail = async <K extends EmailTemplateKey>({
  toEmail,
  templateKey,
  templateData,
  eventKey,
  triggeredByUserId,
  recipientUserId,
  profileId,
  familyProfileId,
  workshopEnrollmentId,
}: SendTemplateEmailArgs<K>) => {
  const mode = parseTemplateMigrationMode({
    templateKey,
    env: process.env,
  })

  const legacy = renderLegacyTemplate(templateKey, templateData)
  const draft = await resolvePublishedDraftByKey({
    draftKey: templateKey,
    variables: templateData as Record<string, unknown>,
  })

  if (mode === 'shadow') {
    if (draft) {
      const parity = compareRenderedEmail({ legacy, draft })
      console.info(
        parity.matched
          ? '[email][migration][shadow][match]'
          : '[email][migration][shadow][mismatch]',
        {
          templateKey,
          parity,
        }
      )

      return sendTransactionalEmail({
        toEmail,
        subject: legacy.subject,
        html: legacy.html,
        text: legacy.text,
        templateKey,
        templateData: withMigrationMeta({
          templateData: templateData as Json,
          mode,
          source: 'legacy',
          parity,
        }),
        eventKey,
        triggeredByUserId,
        recipientUserId,
        profileId,
        familyProfileId,
        workshopEnrollmentId,
      })
    }

    console.warn('[email][migration][shadow][published-draft-not-found]', { templateKey })

    return sendTransactionalEmail({
      toEmail,
      subject: legacy.subject,
      html: legacy.html,
      text: legacy.text,
      templateKey,
      templateData: withMigrationMeta({
        templateData: templateData as Json,
        mode,
        source: 'legacy',
        fallbackApplied: true,
        fallbackReason: 'published-draft-not-found',
      }),
      eventKey,
      triggeredByUserId,
      recipientUserId,
      profileId,
      familyProfileId,
      workshopEnrollmentId,
    })
  }

  if (mode === 'draft') {
    if (draft) {
      return sendTransactionalEmail({
        toEmail,
        subject: draft.subject,
        html: draft.html,
        text: draft.text,
        templateKey,
        templateData: withMigrationMeta({
          templateData: templateData as Json,
          mode,
          source: 'draft',
        }),
        eventKey,
        triggeredByUserId,
        recipientUserId,
        profileId,
        familyProfileId,
        workshopEnrollmentId,
      })
    }

    if (TEMPLATE_FALLBACK_POLICY === 'fail-closed') {
      return {
        status: 'failed',
        id: null,
        error: `Draft mode enabled but no published draft found for template ${templateKey}`,
      }
    }

    console.warn('[email][migration][draft][fallback-legacy]', {
      templateKey,
      fallbackPolicy: TEMPLATE_FALLBACK_POLICY,
    })

    return sendTransactionalEmail({
      toEmail,
      subject: legacy.subject,
      html: legacy.html,
      text: legacy.text,
      templateKey,
      templateData: withMigrationMeta({
        templateData: templateData as Json,
        mode,
        source: 'legacy',
        fallbackApplied: true,
        fallbackReason: 'published-draft-not-found',
      }),
      eventKey,
      triggeredByUserId,
      recipientUserId,
      profileId,
      familyProfileId,
      workshopEnrollmentId,
    })
  }

  return sendTransactionalEmail({
    toEmail,
    subject: legacy.subject,
    html: legacy.html,
    text: legacy.text,
    templateKey,
    templateData: withMigrationMeta({
      templateData: templateData as Json,
      mode,
      source: 'legacy',
    }),
    eventKey,
    triggeredByUserId,
    recipientUserId,
    profileId,
    familyProfileId,
    workshopEnrollmentId,
  })
}

export const resendEmailMessageById = async ({
  emailMessageId,
  triggeredByUserId,
}: {
  emailMessageId: string
  triggeredByUserId: string
}) => {
  const { data: message, error } = await adminClient
    .from('email_message')
    .select(
      'id, to_email, template_key, template_data, recipient_user_id, profile_id, family_profile_id, workshop_enrollment_id'
    )
    .eq('id', emailMessageId)
    .single()

  if (error || !message) {
    return { ok: false, error: error?.message ?? 'Email message not found' }
  }

  const mode = parseTemplateMigrationMode({
    templateKey: message.template_key,
    env: process.env,
  })

  const draftRendered = await resolvePublishedDraftByKey({
    draftKey: message.template_key,
    variables: normalizeTemplateVariables(message.template_data),
  })

  if (draftRendered && mode !== 'legacy') {
    const resendResult = await sendTransactionalEmail({
      toEmail: message.to_email,
      subject: draftRendered.subject,
      html: draftRendered.html,
      text: draftRendered.text,
      templateKey: message.template_key,
      templateData: withMigrationMeta({
        templateData: message.template_data,
        mode,
        source: 'draft',
      }),
      eventKey: null,
      triggeredByUserId,
      recipientUserId: message.recipient_user_id,
      profileId: message.profile_id,
      familyProfileId: message.family_profile_id,
      workshopEnrollmentId: message.workshop_enrollment_id,
    })

    if (resendResult.status === 'failed') {
      return { ok: false, error: resendResult.error ?? 'Resend failed' }
    }

    return { ok: true }
  }

  const templateEntry = (emailTemplates as Record<string, { render: (data: unknown) => { subject: string; html: string; text: string } }>)[message.template_key]

  if (!templateEntry) {
    return { ok: false, error: `Unknown template key: ${message.template_key}` }
  }

  const rendered = templateEntry.render(message.template_data)
  const resendResult = await sendTransactionalEmail({
    toEmail: message.to_email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    templateKey: message.template_key,
    templateData: withMigrationMeta({
      templateData: message.template_data,
      mode,
      source: 'legacy',
      ...(mode !== 'legacy'
        ? {
            fallbackApplied: true,
            fallbackReason: draftRendered ? 'mode-set-legacy' : 'published-draft-not-found',
          }
        : {}),
    }),
    eventKey: null,
    triggeredByUserId,
    recipientUserId: message.recipient_user_id,
    profileId: message.profile_id,
    familyProfileId: message.family_profile_id,
    workshopEnrollmentId: message.workshop_enrollment_id,
  })

  if (resendResult.status === 'failed') {
    return { ok: false, error: resendResult.error ?? 'Resend failed' }
  }

  return { ok: true }
}
