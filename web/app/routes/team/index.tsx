import type { Route } from './+types/index'
import { teamPages } from './nav'

export const loader = ({ context }: Route.LoaderArgs) => context

export default function TeamOverviewPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Manage</p>
        <h1 className="text-2xl font-semibold leading-tight">Admin workspace</h1>
        <p className="text-muted-foreground">Manage every table in the app from a single hub.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teamPages.map(page => (
          <a
            key={page.to}
            href={page.to}
            className="rounded-lg border bg-card p-4 shadow-sm transition hover:-translate-y-0.5"
          >
            <h2 className="text-lg font-semibold">{page.label}</h2>
            <p className="text-sm text-muted-foreground">{page.description}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
