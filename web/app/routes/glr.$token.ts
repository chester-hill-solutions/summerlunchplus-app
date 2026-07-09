import { redirect, type LoaderFunctionArgs } from 'react-router'

import { extractRequestMetadata } from '@/lib/request-metadata.server'
import { adminClient } from '@/lib/supabase/adminClient'

import { resolveGiftCardRelease } from '@/lib/gift-cards/release.server'
import { hashGlrToken } from '@/lib/gift-cards/token.server'

const homeMessageRedirect = ({ request, message }: { request: Request; message: string }) => {
  const url = new URL('/home', request.url)
  url.searchParams.set('enrollmentStatus', 'error')
  url.searchParams.set('enrollmentMessage', message)
  return redirect(`${url.pathname}?${url.searchParams.toString()}`)
}

const invalidLink = ({ request }: { request: Request }) =>
  homeMessageRedirect({
    request,
    message: 'This gift card link is invalid or unavailable. Please contact support for help.',
  })

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = (params.token ?? '').trim()
  if (!token) return invalidLink({ request })

  const tokenHash = hashGlrToken(token)
  const { data: allocationByHash, error: allocationError } = await adminClient
    .from('gift_card_allocation')
    .select('id, profile_id, blocked, status, metadata, class_id, gift_card_asset_id, asset:gift_card_asset_id(asset_url), class:class_id(starts_at, ends_at)')
    .eq('glr_token_hash', tokenHash)
    .maybeSingle()

  if (allocationError) {
    console.error('[glr] lookup failed', { tokenHashPrefix: tokenHash.slice(0, 12), error: allocationError.message })
    return homeMessageRedirect({
      request,
      message: 'Unable to process this gift card link right now. Please try again in a few minutes.',
    })
  }

  const isUuidToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
  let allocation = allocationByHash
  if (!allocation && isUuidToken) {
    const { data: allocationById } = await adminClient
      .from('gift_card_allocation')
      .select('id, profile_id, blocked, status, metadata, class_id, gift_card_asset_id, asset:gift_card_asset_id(asset_url), class:class_id(starts_at, ends_at)')
      .eq('id', token)
      .maybeSingle()
    allocation = allocationById
  }

  const classRelation = allocation?.class
  const classAt = (Array.isArray(classRelation) ? classRelation[0] : classRelation)?.starts_at ??
    (Array.isArray(classRelation) ? classRelation[0] : classRelation)?.ends_at ??
    null
  const released = resolveGiftCardRelease({
    metadata: allocation?.metadata ?? null,
    classAt,
    classEndsAt: (Array.isArray(classRelation) ? classRelation[0] : classRelation)?.ends_at ?? null,
  }).isReleased

  if (!allocation || allocation.blocked || (allocation.status === 'allocated' && !released)) {
    return invalidLink({ request })
  }

  const assetRelation = Array.isArray(allocation.asset) ? allocation.asset[0] : allocation.asset
  const redirectUrl = (assetRelation?.asset_url ?? '').trim()
  if (!redirectUrl) {
    return invalidLink({ request })
  }

  const requestMetadata = extractRequestMetadata(request)
  const clickMetadata = {
    tokenHashPrefix: tokenHash.slice(0, 12),
    ipSelected: requestMetadata.ipSelected,
    ipSelectedSource: requestMetadata.ipSelectedSource,
    ipChain: requestMetadata.ipChain,
    forwardedFor: requestMetadata.forwardedFor,
    referer: requestMetadata.referer,
    origin: requestMetadata.origin,
  }

  const { error: clickError } = await adminClient.from('gift_card_click_event').insert({
    gift_card_allocation_id: allocation.id,
    profile_id: allocation.profile_id,
    ip_address: requestMetadata.ipAddress,
    user_agent: requestMetadata.userAgent,
    metadata: clickMetadata,
  })

  if (clickError) {
    console.error('[glr] click insert failed', {
      allocationId: allocation.id,
      error: clickError.message,
    })
  }

  const nowIso = new Date().toISOString()
  const { data: currentAllocation } = await adminClient
    .from('gift_card_allocation')
    .select('open_count, first_opened_at')
    .eq('id', allocation.id)
    .maybeSingle()

  const nextOpenCount = Number(currentAllocation?.open_count ?? 0) + 1
  const firstOpenedAt = currentAllocation?.first_opened_at ?? nowIso

  await adminClient
    .from('gift_card_allocation')
    .update({
      status: 'opened',
      first_opened_at: firstOpenedAt,
      last_opened_at: nowIso,
      open_count: nextOpenCount,
    })
    .eq('id', allocation.id)

  await adminClient
    .from('gift_card_asset')
    .update({
      status: 'opened',
      opened_at: firstOpenedAt,
      last_opened_at: nowIso,
      opened_count: nextOpenCount,
    })
    .eq('id', allocation.gift_card_asset_id)

  return redirect(redirectUrl)
}
