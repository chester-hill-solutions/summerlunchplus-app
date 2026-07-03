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

type GiftCardAllocationRow = {
  gift_card_asset_id: string
  reminder_sent_at: string | null
  metadata: { release_at?: string | null } | null
}

const TORONTO_TIME_ZONE = 'America/Toronto'

const parseHourMinuteEnv = (name: string, fallback: number) => {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const isProductionRuntime = process.env.NODE_ENV === 'production'
const REMINDER_HOUR_TORONTO = parseHourMinuteEnv('GIFT_CARD_REMINDER_HOUR_TORONTO', isProductionRuntime ? 12 : 11)
const REMINDER_MINUTE_TORONTO = parseHourMinuteEnv('GIFT_CARD_REMINDER_MINUTE_TORONTO', isProductionRuntime ? 0 : 15)

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

const torontoPartsForDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TORONTO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return {
    year: Number.parseInt(get('year'), 10),
    month: Number.parseInt(get('month'), 10),
    day: Number.parseInt(get('day'), 10),
  }
}

const torontoTimeUtcForDate = (year: number, month: number, day: number, hour: number, minute: number) => {
  for (const utcHour of [16, 17, 15, 18]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, utcHour, minute, 0, 0))
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TORONTO_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(candidate)

    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
    const localYear = Number.parseInt(get('year'), 10)
    const localMonth = Number.parseInt(get('month'), 10)
    const localDay = Number.parseInt(get('day'), 10)
    const localHour = Number.parseInt(get('hour'), 10)
    const localMinute = Number.parseInt(get('minute'), 10)
    if (
      localYear === year &&
      localMonth === month &&
      localDay === day &&
      localHour === hour &&
      localMinute === minute
    ) {
      return candidate.toISOString()
    }
  }

  return null
}

const formatTorontoDateTime = (value: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    timeZone: TORONTO_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(parsed)
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

  const assetIds = (assets ?? []).map(asset => asset.id)
  const { data: allocations, error: allocationError } = assetIds.length
    ? await supabase
        .from('gift_card_allocation')
        .select('gift_card_asset_id, reminder_sent_at, metadata')
        .in('gift_card_asset_id', assetIds)
    : { data: [], error: null }

  if (allocationError) {
    throw new Response(allocationError.message, { status: 500 })
  }

  const allocationByAssetId = new Map<string, GiftCardAllocationRow>()
  for (const allocation of (allocations ?? []) as GiftCardAllocationRow[]) {
    allocationByAssetId.set(allocation.gift_card_asset_id, allocation)
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
    system_available_at: formatTorontoDateTime((allocationByAssetId.get(asset.id)?.metadata?.release_at ?? '').trim() || null),
    system_reminder_at: (() => {
      const allocation = allocationByAssetId.get(asset.id)
      if (allocation?.reminder_sent_at) return formatTorontoDateTime(allocation.reminder_sent_at)
      const releaseAt = (allocation?.metadata?.release_at ?? '').trim()
      if (!releaseAt) return ''
      const releaseDate = new Date(releaseAt)
      if (!Number.isFinite(releaseDate.getTime())) return ''
      const releaseToronto = torontoPartsForDate(releaseDate)
      const reminderIso = torontoTimeUtcForDate(
        releaseToronto.year,
        releaseToronto.month,
        releaseToronto.day,
        REMINDER_HOUR_TORONTO,
        REMINDER_MINUTE_TORONTO
      )
      return formatTorontoDateTime(reminderIso)
    })(),
    created_at: asset.created_at,
  }))

  return {
    label: 'Gift card assets',
    tableName: 'gift-cards',
    columns: [
      'provider',
      'account_number',
      'pin',
      'value',
      'status',
      'asset_url',
      'assigned_profile_id',
      'upload_id',
      'system_available_at',
      'system_reminder_at',
      'created_at',
    ],
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
      system_available_at: { label: 'System available' },
      system_reminder_at: { label: 'System reminder' },
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
