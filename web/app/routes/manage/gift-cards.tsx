import { useEffect, useRef } from 'react'
import { Link, useFetcher } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import type { GiftCardAllocationForecastSnapshot, GiftCardProvider } from '@/lib/gift-cards/forecast.server'
import { isRoleAtLeast } from '@/lib/roles'
import DeferredTableDisplay from './deferred-table-display'
import type { LoaderData } from './table-display'

import type { Route } from './+types/gift-cards'

const providers: GiftCardProvider[] = ['PC', 'Sobeys']

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) throw new Response('Forbidden', { status: 403 })
  return null
}

const emptyTableData: LoaderData = {
  label: 'Gift card assets',
  tableName: 'gift-cards',
  columns: [],
  rows: [],
}

const formatWeekLabel = (startsAt: string, endsAt: string, timezone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  })
  const inclusiveEnd = new Date(Date.parse(endsAt) - 1)
  return `${formatter.format(new Date(startsAt))}-${formatter.format(inclusiveEnd)}`
}

export default function GiftCardsPage() {
  const statsFetcher = useFetcher<GiftCardAllocationForecastSnapshot>()
  const statsRequestedRef = useRef(false)

  useEffect(() => {
    if (statsRequestedRef.current) return
    statsRequestedRef.current = true
    statsFetcher.load('/manage/gift-cards/stats-data')
  }, [statsFetcher])

  const data = statsFetcher.data

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Gift cards</h1>
          <p className="text-sm text-muted-foreground">
            Cards are allocated per qualified participant attendance. Weeks run Sunday through Saturday in America/Toronto.
          </p>
        </div>
        <Button asChild>
          <Link to="/manage/gift-cards/upload">Upload gift cards</Link>
        </Button>
      </div>

      {data ? (
        <div className="overflow-x-auto rounded border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-semibold" rowSpan={2}>Gift card type</th>
                <th className="px-3 py-2 font-semibold" rowSpan={2}>Accepted families</th>
                <th className="px-3 py-2 font-semibold" rowSpan={2}>Non-allocated cards</th>
                {data.weeks.map(week => (
                  <th key={week.startsAt} className="px-3 py-2 text-center font-semibold" colSpan={2}>
                    {formatWeekLabel(week.startsAt, week.endsAt, data.timezone)}
                  </th>
                ))}
                <th className="px-3 py-2 font-semibold" rowSpan={2}>Total used</th>
              </tr>
              <tr className="border-b text-xs uppercase tracking-wide">
                {data.weeks.flatMap(week => [
                  <th key={`${week.startsAt}-allocated`} className="px-3 py-2 font-semibold">Allocated</th>,
                  <th key={`${week.startsAt}-needed`} className="px-3 py-2 font-semibold">Still needed</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {providers.map(provider => (
                <tr key={provider} className="border-b last:border-0">
                  <th className="px-3 py-2 text-left font-semibold">{provider}</th>
                  <td className="px-3 py-2 text-center">{data.acceptedFamilies[provider].toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">{data.available[provider].toLocaleString()}</td>
                  {data.weeks.flatMap(week => [
                    <td key={`${week.startsAt}-${provider}-allocated`} className="px-3 py-2 text-center">
                      {week.allocated[provider].toLocaleString()}
                    </td>,
                    <td
                      key={`${week.startsAt}-${provider}-needed`}
                      className={`px-3 py-2 text-center ${week.stillNeeded[provider] > 0 ? 'font-semibold text-amber-700' : ''}`}
                    >
                      {week.stillNeeded[provider].toLocaleString()}
                    </td>,
                  ])}
                  <td className="px-3 py-2 text-center">{data.used[provider].toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">Loading gift card summary...</div>
      )}

      <DeferredTableDisplay dataPath="/manage/gift-cards/table-data" fallbackData={emptyTableData} />
    </main>
  )
}
