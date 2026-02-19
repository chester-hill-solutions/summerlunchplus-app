import type { Route } from './+types/team.class-management.classes'

export const loader = ({ context }: Route.LoaderArgs) => context

export default function ClassesPage() {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Classes</h2>
      <p className="text-sm text-muted-foreground">Schedule class sessions with start and end times for each cohort.</p>
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Class scheduling UI coming soon.
      </div>
    </div>
  )
}
