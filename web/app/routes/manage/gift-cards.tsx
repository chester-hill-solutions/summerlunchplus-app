import { useEffect, useMemo, useRef } from 'react'
import { Link, useFetcher, useLoaderData, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { loadGiftCardInventorySnapshot } from '@/lib/gift-cards/inventory.server'
import { isEligibilityTimingEnabled } from '@/lib/gift-cards/release.server'
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

type ProfileRow = {
  id: string
  firstname: string | null
  surname: string | null
  email: string | null
}

const GIFT_CARD_STATUS_ORDER: GiftCardAssetRow['status'][] = ['available', 'allocated', 'sent', 'opened', 'used', 'invalid']
const GIFT_CARD_PROVIDERS = ['PC', 'Sobeys'] as const

const TORONTO_TIME_ZONE = 'America/Toronto'

const parseHourMinuteEnv = (name: string, fallback: number) => {
  if (typeof process === 'undefined') return fallback
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const isProductionRuntime = typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
const RELEASE_HOUR_TORONTO = parseHourMinuteEnv('GIFT_CARD_RELEASE_HOUR_TORONTO', 11)
const RELEASE_MINUTE_TORONTO = parseHourMinuteEnv('GIFT_CARD_RELEASE_MINUTE_TORONTO', isProductionRuntime ? 45 : 0)
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

const profileDisplay = (profile: ProfileRow | null, fallbackId: string) => {
  const first = (profile?.firstname ?? '').trim()
  const last = (profile?.surname ?? '').trim()
  const full = [first, last].filter(Boolean).join(' ').trim()
  if (full) return full
  if (profile?.email?.trim()) return profile.email.trim()
  return fallbackId ? `Profile ${fallbackId.slice(0, 8)}` : '—'
}

const formatTorontoClock = (hour: number, minute: number) => {
  const probe = new Date(Date.UTC(2026, 0, 2, hour + 5, minute, 0, 0))
  return new Intl.DateTimeFormat(undefined, {
    timeZone: TORONTO_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(probe)
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Forbidden', { status: 403 })
  }

  const url = new URL(request.url)
  const deferTable = url.searchParams.get('_deferTable') === '1'
  if (!deferTable) {
    return buildGiftCardShellData()
  }

  const [tableRowsData, inventorySnapshot] = await Promise.all([
    loadGiftCardTableRows(request),
    loadGiftCardInventorySnapshot(),
  ])

  const statusTotals = GIFT_CARD_STATUS_ORDER.map(status => ({ status, count: inventorySnapshot.statusTotals[status] }))

  return {
    ...buildGiftCardShellData(),
    ...tableRowsData,
    inventorySnapshot,
    statusTotals,
  }
}

const loadGiftCardTableRows = async (request: Request) => {
  const { supabase } = createClient(request)
  const { data: assets, error } = await supabase
    .from('gift_card_asset')
    .select('id, provider, account_number, pin, value, asset_url, status, assigned_profile_id, upload_id, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Response(error.message, { status: 500 })
  }

  const assignedProfileIds = Array.from(
    new Set(
      ((assets ?? []) as GiftCardAssetRow[])
        .map(asset => (typeof asset.assigned_profile_id === 'string' ? asset.assigned_profile_id : ''))
        .filter(Boolean)
    )
  )

  const profileById = new Map<string, ProfileRow>()
  if (assignedProfileIds.length) {
    const { data: profiles, error: profileError } = await supabase
      .from('profile')
      .select('id, firstname, surname, email')
      .in('id', assignedProfileIds)

    if (profileError) {
      throw new Response(profileError.message, { status: 500 })
    }

    for (const profile of (profiles ?? []) as ProfileRow[]) {
      profileById.set(profile.id, profile)
    }
  }

  const rows = ((assets ?? []) as GiftCardAssetRow[]).map(asset => ({
    provider: asset.provider,
    account_number: mask(asset.account_number),
    pin: mask(asset.pin),
    value: formatMoney(asset.value),
    status: asset.status,
    asset_url: asset.asset_url,
    profile_id: asset.assigned_profile_id ?? '',
    profile_display: profileDisplay(asset.assigned_profile_id ? profileById.get(asset.assigned_profile_id) ?? null : null, asset.assigned_profile_id ?? ''),
    upload_id: asset.upload_id.slice(0, 8),
    created_at: asset.created_at,
  }))

  const assignedProfileCount = rows.filter(row => row.profile_id).length
  const totalAssetCount = rows.length
  return {
    totalAssetCount,
    columns: ['provider', 'account_number', 'pin', 'value', 'status', 'asset_url', 'profile_display', 'upload_id', 'created_at'] as string[],
    rows,
    columnMeta: {
      provider: { label: 'Provider' },
      account_number: { label: 'Account' },
      pin: { label: 'PIN' },
      value: { label: 'Value' },
      status: { label: 'Status' },
      asset_url: { label: 'Link' },
      profile_display: { label: `${assignedProfileCount}/${totalAssetCount} Assigned profile` },
      upload_id: { label: 'Upload ID' },
      created_at: { label: 'Created' },
    },
  }
}

const buildGiftCardShellData = () => {
  const emptyInventorySnapshot = {
    generatedAt: new Date().toISOString(),
    horizonDays: 14,
    providers: {
      PC: {
        provider: 'PC' as const,
        statusCounts: {
          available: 0,
          allocated: 0,
          sent: 0,
          opened: 0,
          used: 0,
          invalid: 0,
        },
        total: 0,
        available: 0,
        threshold: 0,
        isLow: false,
        nearTermDemand: 0,
        upcomingDemand: 0,
        projectedDemand: 0,
        projectedShortfall: 0,
      },
      Sobeys: {
        provider: 'Sobeys' as const,
        statusCounts: {
          available: 0,
          allocated: 0,
          sent: 0,
          opened: 0,
          used: 0,
          invalid: 0,
        },
        total: 0,
        available: 0,
        threshold: 0,
        isLow: false,
        nearTermDemand: 0,
        upcomingDemand: 0,
        projectedDemand: 0,
        projectedShortfall: 0,
      },
    },
    statusTotals: {
      available: 0,
      allocated: 0,
      sent: 0,
      opened: 0,
      used: 0,
      invalid: 0,
    },
    totals: {
      totalAssets: 0,
      totalAvailable: 0,
      totalNearTermDemand: 0,
      totalUpcomingDemand: 0,
      totalProjectedDemand: 0,
    },
  }

  return {
    label: 'Gift card assets',
    tableName: 'gift-cards',
    systemTiming: {
      timezone: TORONTO_TIME_ZONE,
      release: `Mon/Fri ${formatTorontoClock(RELEASE_HOUR_TORONTO, RELEASE_MINUTE_TORONTO)}`,
      reminder: `Mon/Fri ${formatTorontoClock(REMINDER_HOUR_TORONTO, REMINDER_MINUTE_TORONTO)}`,
    },
    eligibilityTimingEnabled: isEligibilityTimingEnabled(),
    inventorySnapshot: emptyInventorySnapshot,
    statusTotals: GIFT_CARD_STATUS_ORDER.map(status => ({ status, count: 0 })),
    totalAssetCount: 0,
    columns: ['provider', 'account_number', 'pin', 'value', 'status', 'asset_url', 'profile_display', 'upload_id', 'created_at'],
    rows: [] as Record<string, unknown>[],
    columnMeta: {
      provider: { label: 'Provider' },
      account_number: { label: 'Account' },
      pin: { label: 'PIN' },
      value: { label: 'Value' },
      status: { label: 'Status' },
      asset_url: { label: 'Link' },
      profile_display: { label: '0/0 Assigned profile' },
      upload_id: { label: 'Upload ID' },
      created_at: { label: 'Created' },
    },
  }
}

export default function GiftCardsPage() {
  const fallbackData = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof loader>()
  const location = useLocation()
  const lastRequestedUrlRef = useRef<string | null>(null)
  const lastResolvedDataRef = useRef<typeof fallbackData | null>(null)

  const dataRequestUrl = useMemo(() => {
    const next = new URLSearchParams(location.search)
    next.set('_deferTable', '1')
    const query = next.toString()
    return query ? `/manage/gift-cards/table-data?${query}` : '/manage/gift-cards/table-data'
  }, [location.search])

  useEffect(() => {
    if (lastRequestedUrlRef.current === dataRequestUrl) return
    lastRequestedUrlRef.current = dataRequestUrl
    fetcher.load(dataRequestUrl)
  }, [dataRequestUrl, fetcher])

  useEffect(() => {
    if (!fetcher.data) return
    lastResolvedDataRef.current = fetcher.data
  }, [fetcher.data])

  const resolvedData = fetcher.data ?? lastResolvedDataRef.current ?? fallbackData
  const data = {
    ...resolvedData,
    label: fallbackData.label,
    tableName: fallbackData.tableName,
  }

  const rowLoadingMessage =
    fetcher.state !== 'idle'
      ? fetcher.data || lastResolvedDataRef.current
        ? 'Refreshing gift card rows...'
        : 'Loading gift card rows...'
      : null

  const paginationActions = rowLoadingMessage ? (
    <span className="rounded border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">{rowLoadingMessage}</span>
  ) : undefined

  return (
    <TableDisplay
      data={data}
      paginationActions={paginationActions}
      headerActions={
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Totals</span>
            <span className="rounded border bg-background px-2 py-1 text-foreground">all: {data.totalAssetCount}</span>
            {data.statusTotals.map(item => (
              <span key={item.status} className="rounded border bg-background px-2 py-1 text-foreground">
                {item.status}: {item.count}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Inventory watch</span>
            {GIFT_CARD_PROVIDERS.map(provider => {
              const summary = data.inventorySnapshot.providers[provider]
              return (
                <span
                  key={provider}
                  className={`rounded border bg-background px-2 py-1 text-foreground ${summary.isLow ? 'border-red-300 text-red-700' : ''}`}
                >
                  {provider} available: {summary.available} | needed next {data.inventorySnapshot.horizonDays} days:{' '}
                  {summary.projectedDemand}
                </span>
              )
            })}
          </div>
          <div className="rounded border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {data.eligibilityTimingEnabled ? (
              <>
                <span className="font-medium text-foreground">Availability rule</span> Available and reminder eligible after 6
                hours qualified and past class-week Friday noon (Toronto).
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">System timing</span>{' '}
                (timezone: {data.systemTiming.timezone}) - Available: {data.systemTiming.release} - Reminder: {data.systemTiming.reminder}
              </>
            )}
          </div>
          <Button asChild>
            <Link to="/manage/gift-cards/upload">Upload gift cards</Link>
          </Button>
        </div>
      }
    />
  )
}
