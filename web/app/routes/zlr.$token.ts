import { redirect, type LoaderFunctionArgs } from 'react-router'

import { extractRequestMetadata } from '@/lib/request-metadata.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { hashZlrToken } from '@/lib/zoom-jobs/zlr-token.server'

const homeMessageRedirect = ({ request, message }: { request: Request; message: string }) => {
  const url = new URL('/home', request.url)
  url.searchParams.set('enrollmentStatus', 'error')
  url.searchParams.set('enrollmentMessage', message)
  return redirect(`${url.pathname}?${url.searchParams.toString()}`)
}

const invalidLink = ({ request }: { request: Request }) =>
  homeMessageRedirect({
    request,
    message: 'This class link is invalid or expired. Please request a new class reminder email.',
  })

const unavailableLink = ({ request }: { request: Request }) =>
  homeMessageRedirect({
    request,
    message: 'This class link is no longer available. Please contact support if you need help joining.',
  })

const tooEarlyLink = ({ request, startsAt }: { request: Request; startsAt: string }) =>
  homeMessageRedirect({
    request,
    message: `You can join up to 15 minutes before class starts. Scheduled start: ${new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(startsAt))}.`,
  })

const tooLateLink = ({ request }: { request: Request }) =>
  homeMessageRedirect({
    request,
    message: 'This class link is closed. Join access ends 15 minutes after class end time.',
  })

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = (params.token ?? '').trim()
  if (!token) return invalidLink({ request })

  const tokenHash = hashZlrToken(token)
  const { data: registrant, error: registrantError } = await adminClient
    .from('class_zoom_registrant')
    .select('id, profile_id, class_id, zoom_join_url, zlr_expires_at, class:class_id ( starts_at, ends_at )')
    .eq('zlr_token_hash', tokenHash)
    .maybeSingle()

  if (registrantError) {
    console.error('[zlr] lookup failed', { tokenHashPrefix: tokenHash.slice(0, 12), error: registrantError.message })
    return homeMessageRedirect({
      request,
      message: 'Unable to process this class link right now. Please try again in a few minutes.',
    })
  }

  if (!registrant) {
    return invalidLink({ request })
  }

  const requestMetadata = extractRequestMetadata(request)
  const clickMetadata = {
    classId: registrant.class_id,
    tokenHashPrefix: tokenHash.slice(0, 12),
    ipSelected: requestMetadata.ipSelected,
    ipSelectedSource: requestMetadata.ipSelectedSource,
    ipChain: requestMetadata.ipChain,
    forwardedFor: requestMetadata.forwardedFor,
    referer: requestMetadata.referer,
    origin: requestMetadata.origin,
  }

  const { error: clickError } = await adminClient.from('zlr_click_event').insert({
    class_zoom_registrant_id: registrant.id,
    profile_id: registrant.profile_id,
    ip_address: requestMetadata.ipAddress,
    user_agent: requestMetadata.userAgent,
    metadata: clickMetadata,
  })

  if (clickError) {
    console.error('[zlr] click insert failed', {
      registrantId: registrant.id,
      classId: registrant.class_id,
      error: clickError.message,
    })
  }

  const expiresAt = registrant.zlr_expires_at ? new Date(registrant.zlr_expires_at) : null
  if (expiresAt && Number.isFinite(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
    return unavailableLink({ request })
  }

  const classRelation = Array.isArray(registrant.class) ? registrant.class[0] : registrant.class
  const nowMs = Date.now()
  const classStartsAtMs = classRelation?.starts_at ? new Date(classRelation.starts_at).getTime() : Number.NaN
  const classEndsAtMs = classRelation?.ends_at ? new Date(classRelation.ends_at).getTime() : Number.NaN

  if (Number.isFinite(classStartsAtMs) && nowMs < classStartsAtMs - 15 * 60_000) {
    return tooEarlyLink({ request, startsAt: classRelation.starts_at })
  }

  if (Number.isFinite(classEndsAtMs) && nowMs > classEndsAtMs + 15 * 60_000) {
    return tooLateLink({ request })
  }

  const joinUrl = (registrant.zoom_join_url ?? '').trim()
  if (!joinUrl) {
    return unavailableLink({ request })
  }

  return redirect(joinUrl)
}
