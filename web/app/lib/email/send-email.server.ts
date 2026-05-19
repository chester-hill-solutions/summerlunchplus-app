import type { Json } from '@/lib/database.types'
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
  const template = emailTemplates[templateKey].render(templateData)

  return sendTransactionalEmail({
    toEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    templateKey,
    templateData: templateData as Json,
    eventKey,
    triggeredByUserId,
    recipientUserId,
    profileId,
    familyProfileId,
    workshopEnrollmentId,
  })
}
