import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/gift-cards.table-data'

type GiftCardAssetRow = {
  provider: 'PC' | 'Sobeys'
  account_number: string
  pin: string
  value: number
  asset_url: string
  status: string
  assigned_profile_id: string | null
  upload_id: string
  created_at: string
}

type ProfileRow = {
  id: string
  firstname: string | null
  surname: string | null
  email: string | null
}

const assetBatchSize = 1000
const profileBatchSize = 100

const mask = (value: string, visibleDigits = 4) => {
  const trimmed = value.trim()
  return trimmed.length <= visibleDigits ? trimmed : `${'•'.repeat(trimmed.length - visibleDigits)}${trimmed.slice(-visibleDigits)}`
}

const profileDisplay = (profile: ProfileRow | undefined, profileId: string) => {
  const name = [profile?.firstname, profile?.surname].filter(Boolean).join(' ').trim()
  return name || profile?.email?.trim() || `Profile ${profileId.slice(0, 8)}`
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) throw new Response('Forbidden', { status: 403 })

  const { supabase } = createClient(request)
  const assets: GiftCardAssetRow[] = []
  for (let offset = 0; ; offset += assetBatchSize) {
    const { data, error } = await supabase
      .from('gift_card_asset')
      .select('provider, account_number, pin, value, asset_url, status, assigned_profile_id, upload_id, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + assetBatchSize - 1)
    if (error) throw new Response(error.message, { status: 500 })
    const batch = (data ?? []) as GiftCardAssetRow[]
    assets.push(...batch)
    if (batch.length < assetBatchSize) break
  }

  const profileById = new Map<string, ProfileRow>()
  const profileIds = Array.from(new Set(assets.flatMap(asset => (asset.assigned_profile_id ? [asset.assigned_profile_id] : []))))
  for (let offset = 0; offset < profileIds.length; offset += profileBatchSize) {
    const { data, error } = await supabase
      .from('profile')
      .select('id, firstname, surname, email')
      .in('id', profileIds.slice(offset, offset + profileBatchSize))
    if (error) throw new Response(error.message, { status: 500 })
    for (const profile of (data ?? []) as ProfileRow[]) profileById.set(profile.id, profile)
  }

  const assignedCount = assets.filter(asset => asset.assigned_profile_id).length
  return {
    label: 'Gift card assets',
    tableName: 'gift-cards',
    columns: ['provider', 'account_number', 'pin', 'value', 'status', 'asset_url', 'profile_display', 'upload_id', 'created_at'],
    rows: assets.map(asset => ({
      provider: asset.provider,
      account_number: mask(asset.account_number),
      pin: mask(asset.pin),
      value: new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(asset.value),
      status: asset.status,
      asset_url: asset.asset_url,
      profile_display: asset.assigned_profile_id ? profileDisplay(profileById.get(asset.assigned_profile_id), asset.assigned_profile_id) : '—',
      upload_id: asset.upload_id.slice(0, 8),
      created_at: asset.created_at,
    })),
    columnMeta: {
      provider: { label: 'Provider' },
      account_number: { label: 'Account' },
      pin: { label: 'PIN' },
      value: { label: 'Value' },
      status: { label: 'Status' },
      asset_url: { label: 'Link' },
      profile_display: { label: `${assignedCount}/${assets.length} Assigned profile` },
      upload_id: { label: 'Upload ID' },
      created_at: { label: 'Created' },
    },
  }
}
