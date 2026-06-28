import { redirect, type LoaderFunctionArgs } from 'react-router'

import { extractRequestMetadata } from '@/lib/request-metadata.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { hashZlrToken } from '@/lib/zoom-jobs/zlr-token.server'

const noStoreHeaders = {
  'cache-control': 'no-store',
}

const invalidLink = () =>
  new Response('This Zoom link is invalid or expired. Please request a new class reminder email.', {
    status: 404,
    headers: noStoreHeaders,
  })

const unavailableLink = () =>
  new Response('This Zoom link is no longer available. Please contact support if you need help joining.', {
    status: 410,
    headers: noStoreHeaders,
  })

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = (params.token ?? '').trim()
  if (!token) return invalidLink()

  const tokenHash = hashZlrToken(token)
  const { data: registrant, error: registrantError } = await adminClient
    .from('class_zoom_registrant')
    .select('id, profile_id, class_id, zoom_join_url, zlr_expires_at')
    .eq('zlr_token_hash', tokenHash)
    .maybeSingle()

  if (registrantError) {
    console.error('[zlr] lookup failed', { tokenHashPrefix: tokenHash.slice(0, 12), error: registrantError.message })
    return new Response('Unable to process this Zoom link right now.', { status: 500, headers: noStoreHeaders })
  }

  if (!registrant) {
    return invalidLink()
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
    return unavailableLink()
  }

  const joinUrl = (registrant.zoom_join_url ?? '').trim()
  if (!joinUrl) {
    return unavailableLink()
  }

  return redirect(joinUrl)
}
