import { useMemo, useState } from 'react'
import { NavLink, Outlet, redirect, useLoaderData } from 'react-router'

import { ChevronDown, ChevronRight, House, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

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
              stickerSrc: '/stickers/green_hair_orange_girl.png',
              defaultCollapsed: false,
              items: manageSections
                .find(section => section.key === 'user-management')
                ?.items.filter(item => item.to === '/manage/team') ?? [],
            },
          ],
    [isStaff]
  )

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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
    <main className="flex h-[calc(100svh-4rem)] w-full overflow-hidden">
      <aside
        className={cn(
          'relative z-50 shrink-0 overflow-hidden border-r bg-card transition-[width] duration-200',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden p-2">
          <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
            {!sidebarCollapsed ? (
              <NavLink
                to={overviewPage.to}
                end
                className={({ isActive }) =>
                  cn(
                    'flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                    isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                  )
                }
              >
                <House className="size-5" />
                <span>{overviewPage.label}</span>
              </NavLink>
            ) : null}

            <button
              type="button"
              onClick={() => setSidebarCollapsed(prev => !prev)}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </div>

          {sidebarCollapsed ? (
            <div className="mt-3 space-y-2">
              {teamNavSections.map(section => {
                if (!section.items.length) return null
                return (
                  <div key={section.key} className="group relative">
                    <button
                      type="button"
                      className="flex w-full items-center justify-center rounded-md p-0 hover:bg-muted"
                      aria-label={section.label}
                    >
                      <img src={section.stickerSrc} alt={section.label} className="size-20 object-contain" />
                    </button>

                    <div className="pointer-events-none absolute left-full top-0 z-[70] hidden w-64 rounded-lg border bg-card p-2 shadow-lg group-hover:block group-hover:pointer-events-auto group-focus-within:block group-focus-within:pointer-events-auto">
                      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {section.label}
                      </p>
                      <nav className="space-y-1">
                        {section.items.map(item => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/manage'}
                            className={({ isActive }) =>
                              cn(
                                'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                              )
                            }
                          >
                            {item.label}
                          </NavLink>
                        ))}
                      </nav>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
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
                      <span className="flex items-center gap-2">
                        <img src={section.stickerSrc} alt={section.label} className="size-10 object-contain" />
                        {section.label}
                      </span>
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
                                isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
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
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 space-y-6 overflow-y-auto p-6">
        <Outlet />
      </section>
    </main>
  )
}
