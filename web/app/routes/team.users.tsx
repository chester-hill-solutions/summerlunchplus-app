import type { Route } from './+types/team.users'

export const loader = ({ context }: Route.LoaderArgs) => context

export default function TeamUsersPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Users</p>
        <h1 className="text-2xl font-semibold leading-tight">User management</h1>
        <p className="text-muted-foreground">
          Assign roles, review permissions, and approve cohort enrollments.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6 text-muted-foreground shadow-sm">
        Admin tools coming soon.
      </div>
    </div>
  )
}
