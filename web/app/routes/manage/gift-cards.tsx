import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import TableDisplay from './table-display'

import type { Route } from './+types/gift-cards'

type GiftCardAssetRow = {
  id: string
  provider: 'PC' | 'Sobeys'
  account_number: string
  pin: string
  value: number
  asset_url: string
  status: 'available' | 'allocated' | 'sent' | 'opened' | 'used' | 'invalid'
  assigned_profile_id: string | null
  upload_id: string
  created_at: string
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(value)

const mask = (value: string, visibleDigits = 4) => {
  const trimmed = value.trim()
  if (trimmed.length <= visibleDigits) return trimmed
  return `${'•'.repeat(Math.max(0, trimmed.length - visibleDigits))}${trimmed.slice(-visibleDigits)}`
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Forbidden', { status: 403 })
  }

  const { supabase } = createClient(request)
  const { data: assets, error } = await supabase
    .from('gift_card_asset')
    .select('id, provider, account_number, pin, value, asset_url, status, assigned_profile_id, upload_id, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Response(error.message, { status: 500 })
  }

  const rows = ((assets ?? []) as GiftCardAssetRow[]).map(asset => ({
    provider: asset.provider,
    account_number: mask(asset.account_number),
    pin: mask(asset.pin),
    value: formatMoney(asset.value),
    status: asset.status,
    asset_url: asset.asset_url,
    assigned_profile_id: asset.assigned_profile_id ? asset.assigned_profile_id.slice(0, 8) : '',
    upload_id: asset.upload_id.slice(0, 8),
    created_at: asset.created_at,
  }))

  return {
    label: 'Gift card assets',
    tableName: 'gift-cards',
    columns: ['provider', 'account_number', 'pin', 'value', 'status', 'asset_url', 'assigned_profile_id', 'upload_id', 'created_at'],
    rows,
    columnMeta: {
      provider: { label: 'Provider' },
      account_number: { label: 'Account' },
      pin: { label: 'PIN' },
      value: { label: 'Value' },
      status: { label: 'Status' },
      asset_url: { label: 'Link' },
      assigned_profile_id: { label: 'Assigned profile' },
      upload_id: { label: 'Upload ID' },
      created_at: { label: 'Created' },
    },
  }
}

export default function GiftCardsPage() {
  return (
    <TableDisplay
      headerActions={
        <Button asChild>
          <Link to="/manage/gift-cards/upload">Upload gift cards</Link>
        </Button>
      }
    />
  )
}
