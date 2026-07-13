import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, redirect, useFetchers, useLoaderData, useLocation, useNavigation } from 'react-router'

import { ChevronDown, ChevronRight, House, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { cn } from '@/lib/utils'

import type { Route } from './+types/team'
import { manageSections, overviewPage } from './nav'

const shouldLogManageTeamServerInstrumentation =
  process.env.NODE_ENV !== 'production' || process.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

const logManageTeamServerEvent = (event: string, payload: Record<string, unknown>) => {
  if (!shouldLogManageTeamServerInstrumentation) return
  console.info('[manage-team-server]', {
    event,
    at: new Date().toISOString(),
    ...payload,
  })
}

const TEAM_ALLOWED_MANAGE_PATHS = new Set([
  '/manage',
  '/manage/team',
  '/manage/class-attendance',
  '/manage/class-attendance-audit',
  '/manage/class-attendance-card-data',
  '/manage/class',
  '/manage/workshop',
  '/manage/workshop/setup',
  '/manage/workshop-enrollment',
  '/manage/gift-cards',
  '/manage/gift-cards/upload',
  '/manage/families',
])

const TEAM_ALLOWED_MANAGE_PREFIXES = Array.from(TEAM_ALLOWED_MANAGE_PATHS).filter(path => path !== '/manage')

const isTeamAllowedManagePath = (pathname: string) => {
  if (TEAM_ALLOWED_MANAGE_PATHS.has(pathname)) return true
  return TEAM_ALLOWED_MANAGE_PREFIXES.some(prefix => pathname.startsWith(`${prefix}/`))
}

export async function loader({ request }: Route.LoaderArgs) {
  const startedAt = Date.now()
  const requestUrl = request.url
  const auth = await requireAuth(request)
  const pathname = new URL(request.url).pathname
  const isTeamRoute = pathname === '/manage/team'
  const isStaff = auth.claims.role === 'staff'

  logManageTeamServerEvent('loader_start', {
    requestUrl,
    pathname,
    role: auth.claims.role,
    emailHint: auth.emailHint,
    isTeamRoute,
    isStaff,
  })

  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    if (isRoleAtLeast(auth.claims.role, 'instructor')) {
      if (!isTeamRoute) {
        logManageTeamServerEvent('loader_redirect', {
          reason: 'instructor_non_team_path',
          pathname,
          target: '/manage/team',
          role: auth.claims.role,
          emailHint: auth.emailHint,
          durationMs: Date.now() - startedAt,
        })
        throw redirect('/manage/team', { headers: auth.headers })
      }
    } else {
      logManageTeamServerEvent('loader_redirect', {
        reason: 'below_instructor',
        pathname,
        target: '/home',
        role: auth.claims.role,
        emailHint: auth.emailHint,
        durationMs: Date.now() - startedAt,
      })
      throw redirect('/home', { headers: auth.headers })
    }
  }

  if (isStaff && !isTeamAllowedManagePath(pathname)) {
    logManageTeamServerEvent('loader_redirect', {
      reason: 'staff_manage_path_blocked',
      pathname,
      target: '/manage/class-attendance',
      role: auth.claims.role,
      emailHint: auth.emailHint,
      durationMs: Date.now() - startedAt,
    })
    throw redirect('/manage/class-attendance', { headers: auth.headers })
  }

  logManageTeamServerEvent('loader_allow', {
    pathname,
    role: auth.claims.role,
    emailHint: auth.emailHint,
    durationMs: Date.now() - startedAt,
  })

  return { role: auth.claims.role }
}

export default function TeamLayout() {
  const { role } = useLoaderData<typeof loader>()
  const location = useLocation()
  const navigation = useNavigation()
  const fetchers = useFetchers()
  const navStartRef = useRef<number | null>(null)
  const navFromRef = useRef<string>('')
  const isManagerOrAdmin = isRoleAtLeast(role, 'manager')
  const isStaff = role === 'staff'
  const shouldLogManageTeamClientInstrumentation =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

  const logManageTeamClientEvent = (event: string, payload: Record<string, unknown>) => {
    if (!shouldLogManageTeamClientInstrumentation) return
    console.info('[manage-team-client]', {
      event,
      at: new Date().toISOString(),
      ...payload,
    })
  }

  useEffect(() => {
    logManageTeamClientEvent('route_render', {
      pathname: location.pathname,
      search: location.search,
      role,
      isManagerOrAdmin,
      isStaff,
      navigationState: navigation.state,
      activeFetcherCount: fetchers.filter(fetcher => fetcher.state !== 'idle').length,
    })
  }, [fetchers, isManagerOrAdmin, isStaff, location.pathname, location.search, navigation.state, role])

  useEffect(() => {
    const state = navigation.state
    if (state !== 'idle' && navStartRef.current === null) {
      navStartRef.current = performance.now()
      navFromRef.current = `${location.pathname}${location.search}`
      logManageTeamClientEvent('navigation_start', {
        from: navFromRef.current,
        to: navigation.location ? `${navigation.location.pathname}${navigation.location.search}` : null,
        state,
      })
      return
    }

    if (state === 'idle' && navStartRef.current !== null) {
      const durationMs = Math.round(performance.now() - navStartRef.current)
      logManageTeamClientEvent('navigation_end', {
        from: navFromRef.current,
        to: `${location.pathname}${location.search}`,
        durationMs,
      })
      navStartRef.current = null
      navFromRef.current = ''
    }
  }, [location.pathname, location.search, navigation.location, navigation.state])

  const logSidebarNavClick = (target: string) => {
    logManageTeamClientEvent('sidebar_nav_click', {
      from: `${location.pathname}${location.search}`,
      target,
      role,
      isManagerOrAdmin,
      isStaff,
    })
  }

  const teamNavSections = useMemo(
    () =>
      isManagerOrAdmin
        ? manageSections
        : isStaff
          ? [
              {
                key: 'class-management' as const,
                label: 'Class Management',
                stickerSrc: '/stickers/salad_on_plate.png',
                defaultCollapsed: false,
                items: manageSections
                  .find(section => section.key === 'class-management')
                  ?.items.filter(item => TEAM_ALLOWED_MANAGE_PATHS.has(item.to)) ?? [],
              },
              {
                key: 'user-management' as const,
                label: 'User Management',
                stickerSrc: '/stickers/green_hair_orange_girl.png',
                defaultCollapsed: true,
                items: manageSections
                  .find(section => section.key === 'user-management')
                  ?.items.filter(item => TEAM_ALLOWED_MANAGE_PATHS.has(item.to)) ?? [],
              },
            ]
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
    [isManagerOrAdmin, isStaff]
  )

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
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
    <main className="flex w-full items-start">
      <aside
        className={cn(
          'sticky top-16 z-[80] h-[calc(100svh-4rem)] shrink-0 border-r bg-card transition-[width] duration-200',
          sidebarCollapsed ? 'w-16 overflow-visible' : 'w-64 overflow-y-auto'
        )}
      >
        <div className="flex flex-col p-2">
          <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
            {!sidebarCollapsed ? (
              <NavLink
                to={overviewPage.to}
                end
                onClick={() => logSidebarNavClick(overviewPage.to)}
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
                      <img
                        src={section.stickerSrc}
                        alt={section.label}
                        className="size-20 origin-center object-contain"
                        style={section.stickerScale ? { transform: `scale(${section.stickerScale})` } : undefined}
                      />
                    </button>

                    <div className="pointer-events-none absolute left-full top-0 z-[90] hidden w-64 rounded-lg border bg-card p-2 shadow-lg group-hover:block group-hover:pointer-events-auto group-focus-within:block group-focus-within:pointer-events-auto">
                      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {section.label}
                      </p>
                      <nav className="space-y-1">
                        {section.items.map(item => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/manage'}
                            onClick={() => logSidebarNavClick(item.to)}
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
                        <img
                          src={section.stickerSrc}
                          alt={section.label}
                          className="size-10 origin-center object-contain"
                          style={section.stickerScale ? { transform: `scale(${section.stickerScale})` } : undefined}
                        />
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
                            onClick={() => logSidebarNavClick(item.to)}
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

      <section className="relative z-0 min-w-0 flex-1 space-y-6 px-6 pt-6 pb-0">
        <Outlet />
      </section>
    </main>
  )
}
