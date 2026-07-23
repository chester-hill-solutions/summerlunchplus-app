import { useEffect, useMemo, useRef } from 'react'
import { Link, useFetcher, useLoaderData, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { loadGiftCardAllocationForecastSnapshot } from '@/lib/gift-cards/forecast.server'
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
const IN_CLAUSE_BATCH_SIZE = 10

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

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0 || !items.length) return []
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
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

  const [tableRowsData, inventorySnapshot, forecastSnapshot] = await Promise.all([
    loadGiftCardTableRows(request),
    loadGiftCardInventorySnapshot(),
    loadGiftCardAllocationForecastSnapshot(),
  ])

  const statusTotals = GIFT_CARD_STATUS_ORDER.map(status => ({ status, count: inventorySnapshot.statusTotals[status] }))

  return {
    ...buildGiftCardShellData(),
    ...tableRowsData,
    inventorySnapshot,
    forecastSnapshot,
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
    for (const chunk of chunkArray(assignedProfileIds, IN_CLAUSE_BATCH_SIZE)) {
      const { data: profiles, error: profileError } = await supabase
        .from('profile')
        .select('id, firstname, surname, email')
        .in('id', chunk)

      if (profileError) {
        throw new Response(profileError.message, { status: 500 })
      }

      for (const profile of (profiles ?? []) as ProfileRow[]) {
        profileById.set(profile.id, profile)
      }
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

  const emptyForecastSnapshot = {
    generatedAt: new Date().toISOString(),
    timezone: TORONTO_TIME_ZONE,
    windows: {
      d7: {
        days: 7,
        accepted: {
          totalProfiles: 0,
          totalFamilies: 0,
          byPreference: {
            PC: { profiles: 0, families: 0 },
            Sobeys: { profiles: 0, families: 0 },
            meal_kit: { profiles: 0, families: 0 },
          },
        },
        allocation: {
          PC: {
            eligibleProfiles: 0,
            eligibleFamilies: 0,
            allocatedProfiles: 0,
            allocatedFamilies: 0,
            blockedProfiles: 0,
            pendingAttendanceRows: 0,
            pendingProfiles: 0,
            pendingFamilies: 0,
            pendingFamilyClassRows: 0,
          },
          Sobeys: {
            eligibleProfiles: 0,
            eligibleFamilies: 0,
            allocatedProfiles: 0,
            allocatedFamilies: 0,
            blockedProfiles: 0,
            pendingAttendanceRows: 0,
            pendingProfiles: 0,
            pendingFamilies: 0,
            pendingFamilyClassRows: 0,
          },
        },
        inventory: {
          PC: { available: 0, allocated: 0, sent: 0, opened: 0, leftAfterPending: 0, shortfallNow: 0 },
          Sobeys: { available: 0, allocated: 0, sent: 0, opened: 0, leftAfterPending: 0, shortfallNow: 0 },
        },
      },
      d14: {
        days: 14,
        accepted: {
          totalProfiles: 0,
          totalFamilies: 0,
          byPreference: {
            PC: { profiles: 0, families: 0 },
            Sobeys: { profiles: 0, families: 0 },
            meal_kit: { profiles: 0, families: 0 },
          },
        },
        allocation: {
          PC: {
            eligibleProfiles: 0,
            eligibleFamilies: 0,
            allocatedProfiles: 0,
            allocatedFamilies: 0,
            blockedProfiles: 0,
            pendingAttendanceRows: 0,
            pendingProfiles: 0,
            pendingFamilies: 0,
            pendingFamilyClassRows: 0,
          },
          Sobeys: {
            eligibleProfiles: 0,
            eligibleFamilies: 0,
            allocatedProfiles: 0,
            allocatedFamilies: 0,
            blockedProfiles: 0,
            pendingAttendanceRows: 0,
            pendingProfiles: 0,
            pendingFamilies: 0,
            pendingFamilyClassRows: 0,
          },
        },
        inventory: {
          PC: { available: 0, allocated: 0, sent: 0, opened: 0, leftAfterPending: 0, shortfallNow: 0 },
          Sobeys: { available: 0, allocated: 0, sent: 0, opened: 0, leftAfterPending: 0, shortfallNow: 0 },
        },
      },
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
    forecastSnapshot: emptyForecastSnapshot,
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

  const d7 = data.forecastSnapshot.windows.d7
  const d14 = data.forecastSnapshot.windows.d14

  const providerSummaryRows = GIFT_CARD_PROVIDERS.map(provider => {
    const inventory = data.inventorySnapshot.providers[provider]
    const acceptedFamilies7 = d7.accepted.byPreference[provider].families
    const acceptedFamilies14 = d14.accepted.byPreference[provider].families
    const needAllocation7 = d7.allocation[provider].pendingFamilyClassRows
    const needAllocation14 = d14.allocation[provider].pendingFamilyClassRows

    return {
      label: provider,
      totalGiftCards: inventory.total,
      available: inventory.available,
      acceptedFamilies: acceptedFamilies14,
      needAllocation: needAllocation14,
      difference: inventory.available - needAllocation14,
      allocated: inventory.statusCounts.allocated,
      sent: inventory.statusCounts.sent,
      opened: inventory.statusCounts.opened,
      used: inventory.statusCounts.used,
      invalid: inventory.statusCounts.invalid,
      acceptedFamilies7,
      needAllocation7,
      difference7: inventory.available - needAllocation7,
      allocatedProfiles14: d14.allocation[provider].allocatedProfiles,
      pendingProfiles14: d14.allocation[provider].pendingProfiles,
      pendingFamilies14: d14.allocation[provider].pendingFamilies,
      pendingAttendanceRows14: d14.allocation[provider].pendingAttendanceRows,
      leftAfterPending14: d14.inventory[provider].leftAfterPending,
      shortfallNow14: d14.inventory[provider].shortfallNow,
    }
  })

  const totalSummaryRow = providerSummaryRows.reduce(
    (acc, row) => ({
      label: 'Total',
      totalGiftCards: acc.totalGiftCards + row.totalGiftCards,
      available: acc.available + row.available,
      acceptedFamilies: acc.acceptedFamilies + row.acceptedFamilies,
      needAllocation: acc.needAllocation + row.needAllocation,
      difference: acc.difference + row.difference,
      allocated: acc.allocated + row.allocated,
      sent: acc.sent + row.sent,
      opened: acc.opened + row.opened,
      used: acc.used + row.used,
      invalid: acc.invalid + row.invalid,
      acceptedFamilies7: acc.acceptedFamilies7 + row.acceptedFamilies7,
      needAllocation7: acc.needAllocation7 + row.needAllocation7,
      difference7: acc.difference7 + row.difference7,
      allocatedProfiles14: acc.allocatedProfiles14 + row.allocatedProfiles14,
      pendingProfiles14: acc.pendingProfiles14 + row.pendingProfiles14,
      pendingFamilies14: acc.pendingFamilies14 + row.pendingFamilies14,
      pendingAttendanceRows14: acc.pendingAttendanceRows14 + row.pendingAttendanceRows14,
      leftAfterPending14: acc.leftAfterPending14 + row.leftAfterPending14,
      shortfallNow14: acc.shortfallNow14 + row.shortfallNow14,
    }),
    {
      label: 'Total',
      totalGiftCards: 0,
      available: 0,
      acceptedFamilies: 0,
      needAllocation: 0,
      difference: 0,
      allocated: 0,
      sent: 0,
      opened: 0,
      used: 0,
      invalid: 0,
      acceptedFamilies7: 0,
      needAllocation7: 0,
      difference7: 0,
      allocatedProfiles14: 0,
      pendingProfiles14: 0,
      pendingFamilies14: 0,
      pendingAttendanceRows14: 0,
      leftAfterPending14: 0,
      shortfallNow14: 0,
    }
  )

  const summaryRows = [...providerSummaryRows, totalSummaryRow]

  const formatCount = (value: number) => value.toLocaleString()
  const differenceClass = (value: number) => (value < 0 ? 'text-red-700' : 'text-foreground')

  return (
    <TableDisplay
      data={data}
      paginationActions={paginationActions}
      headerActions={
        <div className="space-y-3">
          <div className="overflow-x-auto rounded border bg-card">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Provider</th>
                  <th className="px-3 py-2 font-semibold">Total Gift Cards</th>
                  <th className="px-3 py-2 font-semibold">Available</th>
                  <th className="px-3 py-2 font-semibold">Accepted Families (7d)</th>
                  <th className="px-3 py-2 font-semibold">Need Allocation (7d family-class)</th>
                  <th className="px-3 py-2 font-semibold">Difference (7d)</th>
                  <th className="px-3 py-2 font-semibold">Accepted Families (14d)</th>
                  <th className="px-3 py-2 font-semibold">Need Allocation (14d family-class)</th>
                  <th className="px-3 py-2 font-semibold">Difference (14d)</th>
                  <th className="px-3 py-2 font-semibold">Allocated</th>
                  <th className="px-3 py-2 font-semibold">Sent</th>
                  <th className="px-3 py-2 font-semibold">Opened</th>
                  <th className="px-3 py-2 font-semibold">Used</th>
                  <th className="px-3 py-2 font-semibold">Invalid</th>
                  <th className="px-3 py-2 font-semibold">Allocated Profiles (14d)</th>
                  <th className="px-3 py-2 font-semibold">Pending Profiles (14d)</th>
                  <th className="px-3 py-2 font-semibold">Pending Families (14d unique)</th>
                  <th className="px-3 py-2 font-semibold">Pending Attendance Rows (14d)</th>
                  <th className="px-3 py-2 font-semibold">Left After Pending (14d)</th>
                  <th className="px-3 py-2 font-semibold">Shortfall Now (14d)</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map(row => (
                  <tr key={row.label} className="border-t align-top">
                    <th className="px-3 py-2 text-left font-semibold text-foreground">{row.label}</th>
                    <td className="px-3 py-2">{formatCount(row.totalGiftCards)}</td>
                    <td className="px-3 py-2">{formatCount(row.available)}</td>
                    <td className="px-3 py-2">{formatCount(row.acceptedFamilies7)}</td>
                    <td className="px-3 py-2">{formatCount(row.needAllocation7)}</td>
                    <td className={`px-3 py-2 ${differenceClass(row.difference7)}`}>{formatCount(row.difference7)}</td>
                    <td className="px-3 py-2">{formatCount(row.acceptedFamilies)}</td>
                    <td className="px-3 py-2">{formatCount(row.needAllocation)}</td>
                    <td className={`px-3 py-2 ${differenceClass(row.difference)}`}>{formatCount(row.difference)}</td>
                    <td className="px-3 py-2">{formatCount(row.allocated)}</td>
                    <td className="px-3 py-2">{formatCount(row.sent)}</td>
                    <td className="px-3 py-2">{formatCount(row.opened)}</td>
                    <td className="px-3 py-2">{formatCount(row.used)}</td>
                    <td className="px-3 py-2">{formatCount(row.invalid)}</td>
                    <td className="px-3 py-2">{formatCount(row.allocatedProfiles14)}</td>
                    <td className="px-3 py-2">{formatCount(row.pendingProfiles14)}</td>
                    <td className="px-3 py-2">{formatCount(row.pendingFamilies14)}</td>
                    <td className="px-3 py-2">{formatCount(row.pendingAttendanceRows14)}</td>
                    <td className={`px-3 py-2 ${differenceClass(row.leftAfterPending14)}`}>{formatCount(row.leftAfterPending14)}</td>
                    <td className={`px-3 py-2 ${differenceClass(-row.shortfallNow14)}`}>{formatCount(row.shortfallNow14)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              all rows: <span className="font-medium text-foreground">{formatCount(data.totalAssetCount)}</span>
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
            <div className="rounded border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              horizon: {data.inventorySnapshot.horizonDays} days
            </div>
          </div>
          <Button asChild>
            <Link to="/manage/gift-cards/upload">Upload gift cards</Link>
          </Button>
        </div>
      }
    />
  )
}
