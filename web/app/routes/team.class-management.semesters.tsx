import type { Route } from './+types/team.class-management.semesters'

export const loader = ({ context }: Route.LoaderArgs) => context

export default function SemestersPage() {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Semesters</h2>
      <p className="text-sm text-muted-foreground">Define term start/end dates and keep them unique by month range.</p>
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Semester management UI coming soon.
      </div>
    </div>
  )
}
