import type { Route } from './+types/index'
import { Link, useSearchParams } from 'react-router'

import { manageSections } from './nav'

export const loader = ({ context }: Route.LoaderArgs) => context

export default function TeamOverviewPage() {
  const [searchParams] = useSearchParams()
  const selectedGroupKey = searchParams.get('group')
  const selectedGroup =
    manageSections.find(section => section.key === selectedGroupKey) ?? null

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Manage</p>
        <h1 className="text-2xl font-semibold leading-tight">Admin workspace</h1>
        <p className="text-muted-foreground">Manage every table in the app from a single hub.</p>
      </header>

      {selectedGroup ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Link
              to="/manage"
              className="rounded-md border border-input px-3 py-1 text-sm font-medium text-foreground hover:bg-muted"
            >
              Back to groups
            </Link>
            <h2 className="text-lg font-semibold">{selectedGroup.label}</h2>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {selectedGroup.items.map(page => (
              <Link
                key={page.to}
                to={page.to}
                className="h-36 w-full sm:w-[17.5rem] rounded-lg border bg-card px-2.5 py-2.5 shadow-sm transition hover:-translate-y-0.5"
              >
                <div className="flex h-full items-center gap-3">
                  <img
                    src={selectedGroup.stickerSrc}
                    alt={selectedGroup.label}
                    className="h-[4.5rem] w-[4.5rem] shrink-0 object-contain"
                  />
                  <div className="max-w-[18rem]">
                    <h3 className="text-lg font-semibold leading-tight">{page.label}</h3>
                    <p className="text-sm text-muted-foreground">{page.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {manageSections.map(section => (
            <Link
              key={section.key}
              to={`/manage?group=${section.key}`}
              className="h-36 w-full sm:w-[17.5rem] rounded-lg border bg-card px-2.5 py-2.5 shadow-sm transition hover:-translate-y-0.5"
            >
              <div className="flex h-full items-center gap-3">
                <img
                  src={section.stickerSrc}
                  alt={section.label}
                  className="h-[4.5rem] w-[4.5rem] shrink-0 object-contain"
                />
                <div className="max-w-[18rem]">
                  <h2 className="text-lg font-semibold leading-tight">{section.label}</h2>
                  <p className="text-sm text-muted-foreground">
                    {section.items.length} pages
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
