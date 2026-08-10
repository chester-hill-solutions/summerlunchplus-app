import { Link, useLoaderData } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { loadGiftCardAllocationForecastSnapshot, type GiftCardProvider } from '@/lib/gift-cards/forecast.server'
import { isRoleAtLeast } from '@/lib/roles'

import type { Route } from './+types/gift-cards'

const providers: GiftCardProvider[] = ['PC', 'Sobeys']

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) throw new Response('Forbidden', { status: 403 })
  return loadGiftCardAllocationForecastSnapshot()
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
  const data = useLoaderData<typeof loader>()

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Gift cards</h1>
          <p className="text-sm text-muted-foreground">
            Cards are allocated per qualified participant attendance. Weeks run Sunday through Saturday in {data.timezone}.
          </p>
        </div>
        <Button asChild>
          <Link to="/manage/gift-cards/upload">Upload gift cards</Link>
        </Button>
      </div>

      <div className="overflow-x-auto rounded border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-semibold" rowSpan={2}>Gift card type</th>
              <th className="px-3 py-2 font-semibold" rowSpan={2}>Non-allocated cards</th>
              {data.weeks.map(week => (
                <th key={week.startsAt} className="px-3 py-2 text-center font-semibold" colSpan={3}>
                  {formatWeekLabel(week.startsAt, week.endsAt, data.timezone)}
                </th>
              ))}
            </tr>
            <tr className="border-b text-xs uppercase tracking-wide">
              {data.weeks.flatMap(week => [
                <th key={`${week.startsAt}-families`} className="px-3 py-2 font-semibold">Accepted families</th>,
                <th key={`${week.startsAt}-allocated`} className="px-3 py-2 font-semibold">Allocated</th>,
                <th key={`${week.startsAt}-needed`} className="px-3 py-2 font-semibold">Still needed</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {providers.map(provider => (
              <tr key={provider} className="border-b last:border-0">
                <th className="px-3 py-2 text-left font-semibold">{provider}</th>
                <td className="px-3 py-2">{data.available[provider].toLocaleString()}</td>
                {data.weeks.flatMap(week => [
                  <td key={`${week.startsAt}-${provider}-families`} className="px-3 py-2 text-center">
                    {week.acceptedFamilies[provider].toLocaleString()}
                  </td>,
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
