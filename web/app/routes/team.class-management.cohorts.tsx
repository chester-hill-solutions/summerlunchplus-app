import type { Route } from './+types/team.class-management.cohorts'

export const loader = ({ context }: Route.LoaderArgs) => context

export default function CohortsPage() {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Cohorts</h2>
      <p className="text-sm text-muted-foreground">Group students within a semester and track enrollment approvals.</p>
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Cohort management UI coming soon.
      </div>
    </div>
  )
}
