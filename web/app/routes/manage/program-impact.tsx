import { data, Form, useLoaderData } from 'react-router'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuth } from '@/lib/auth.server'
import { loadProgramImpact } from '@/lib/program-impact.server'
import { isRoleAtLeast } from '@/lib/roles'

import type { Route } from './+types/program-impact'

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const url = new URL(request.url)
  const semesterId = url.searchParams.get('semester') || null
  const result = await loadProgramImpact({ semesterId })
  return data(result, { headers: auth.headers })
}

const currency = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

const number = new Intl.NumberFormat('en-CA')

const formatSource = (source: string) => {
  if (source === 'family_graph') return 'Family graph'
  return source === 'guardian' ? 'Parent answer' : 'Student answer'
}

const SummaryCard = ({
  title,
  description,
  summary,
}: {
  title: string
  description: string
  summary: { families: number; people: number; children: number; cards: number; value: number }
}) => (
  <Card>
    <CardHeader className="border-b">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-5">
      {[
        ['Families', summary.families],
        ['People', summary.people],
        ['Children', summary.children],
        ['Cards', summary.cards],
        ['CAD value', currency.format(summary.value)],
      ].map(([label, value]) => (
        <div key={String(label)}>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{typeof value === 'number' ? number.format(value) : value}</div>
        </div>
      ))}
    </CardContent>
  </Card>
)

export default function ProgramImpactPage() {
  const result = useLoaderData<typeof loader>()

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Analytics</p>
          <h1 className="text-3xl font-semibold leading-tight">Program impact</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Recipient families have at least one sent gift card. Participating families have an accepted workshop and evidence in more than half of eligible completed class rows, including one of the two newest rows.
          </p>
        </div>
        <Form method="get" className="flex items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Semester</span>
            <select name="semester" defaultValue={result.selectedSemesterId ?? ''} className="h-10 min-w-56 rounded-md border border-input bg-background px-3">
              <option value="">All semesters</option>
              {result.semesters.map(semester => (
                <option key={semester.id} value={semester.id}>{semester.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Apply
          </button>
        </Form>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <SummaryCard title="All recipient families" description="Families with at least one sent gift card." summary={result.allRecipients} />
        <SummaryCard title="Participating recipient families" description="Includes provisional families with no completed attendance rows." summary={result.participating} />
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Data quality signals</CardTitle>
          <CardDescription>These counts explain where household and participation values need review.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['People from family graph', result.exceptions.graphPeopleFallback],
            ['Children from family graph', result.exceptions.graphChildrenFallback],
            ['Attendance threshold failures', result.exceptions.attendanceThresholdFailure],
            ['Newest-row evidence failures', result.exceptions.newestEvidenceFailure],
            ['No completed attendance', result.exceptions.noAcceptedWorkshop],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{number.format(Number(value))}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Family detail</CardTitle>
          <CardDescription>Safe detail only. Card numbers, PINs, URLs, and tokens are never returned.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Family key</th>
                <th className="px-3 py-3">Household</th>
                <th className="px-3 py-3">Answer source</th>
                <th className="px-3 py-3">Attendance</th>
                <th className="px-3 py-3">Cards</th>
                <th className="px-3 py-3">Value</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.rows.filter(row => row.sent_card_count > 0).map(row => (
                <tr key={`${row.semester_id}-${row.family_key}`}>
                  <td className="px-6 py-3 font-mono text-xs">{row.family_key}</td>
                  <td className="px-3 py-3 tabular-nums">{row.people} people / {row.children} children</td>
                  <td className="px-3 py-3">{formatSource(row.people_source)} / {formatSource(row.children_source)}</td>
                  <td className="px-3 py-3 tabular-nums">{row.participation_evidence_rows}/{row.eligible_attendance_rows} evidence</td>
                  <td className="px-3 py-3 tabular-nums">{row.sent_card_count}</td>
                  <td className="px-3 py-3 tabular-nums">{currency.format(row.sent_card_value)}</td>
                  <td className="px-6 py-3 font-medium">{row.participation_classification.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
