import { useMemo, useState } from 'react'
import { NavLink, Outlet, redirect, useLoaderData } from 'react-router'

import { ChevronDown, ChevronRight } from 'lucide-react'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { cn } from '@/lib/utils'

import type { Route } from './+types/team'
import { manageSections, overviewPage } from './nav'

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const pathname = new URL(request.url).pathname
  const isTeamRoute = pathname === '/manage/team'

  if (!isRoleAtLeast(auth.claims.role, 'staff') && !(isRoleAtLeast(auth.claims.role, 'instructor') && isTeamRoute)) {
    throw redirect('/home', { headers: auth.headers })
  }

  return { role: auth.claims.role }
}

export default function TeamLayout() {
  const { role } = useLoaderData<typeof loader>()
  const isStaff = isRoleAtLeast(role, 'staff')
  const teamNavSections = useMemo(
    () =>
      isStaff
        ? manageSections
        : [
            {
              key: 'user-management' as const,
              label: 'User Management',
              defaultCollapsed: false,
              items: manageSections
                .find(section => section.key === 'user-management')
                ?.items.filter(item => item.to === '/manage/team') ?? [],
            },
          ],
    [isStaff]
  )

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(teamNavSections.map(section => [section.key, section.defaultCollapsed]))
  )

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }))
  }

  return (
    <main className="flex w-full flex-col gap-6 px-6 py-8 lg:flex-row">
      <aside className="w-full lg:w-56 lg:shrink-0">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">Manage</h2>

          <nav className="mt-3 space-y-1">
            <NavLink
              to={overviewPage.to}
              end
              className={({ isActive }) =>
                cn(
                  'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                )
              }
            >
              {overviewPage.label}
            </NavLink>
          </nav>

          <div className="mt-3 space-y-2">
            {teamNavSections.map(section => {
              if (!section.items.length) return null
              const isCollapsed = collapsedSections[section.key] ?? section.defaultCollapsed

              return (
                <div key={section.key}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted"
                  >
                    <span>{section.label}</span>
                    {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>

                  {!isCollapsed ? (
                    <nav className="mt-1 space-y-1">
                      {section.items.map(item => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/manage'}
                          className={({ isActive }) =>
                            cn(
                              'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground hover:bg-muted'
                            )
                          }
                        >
                          {item.label}
                        </NavLink>
                      ))}
                    </nav>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      <section className="min-w-0 flex-1 space-y-6">
        <Outlet />
      </section>
    </main>
  )
}
