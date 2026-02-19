import type { Route } from './+types/team._index'

export const loader = ({ context }: Route.LoaderArgs) => context

export default function TeamOverviewPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Team</p>
        <h1 className="text-2xl font-semibold leading-tight">Admin workspace</h1>
        <p className="text-muted-foreground">Manage users and class schedules from one place.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">Review accounts, roles, and enrollment approvals.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Class management</h2>
          <p className="text-sm text-muted-foreground">Organize semesters, cohorts, and classes.</p>
        </div>
      </div>
    </div>
  )
}
