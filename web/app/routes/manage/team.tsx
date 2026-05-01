import { NavLink, Outlet, redirect, useLoaderData } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { cn } from '@/lib/utils'

import type { Route } from './+types/team'
import { teamPages } from './nav'

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
  const teamNav = isRoleAtLeast(role, 'staff')
    ? teamPages
    : teamPages.filter(item => item.to === '/manage/team')

  return (
    <main className="flex w-full flex-col gap-6 px-6 py-8 lg:flex-row">
      <aside className="w-full lg:w-56 lg:shrink-0">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
           <h2 className="text-sm font-semibold text-muted-foreground">Manage</h2>
          <nav className="mt-3 space-y-1">
            {teamNav.map((item) => (
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
        </div>
      </aside>

      <section className="min-w-0 flex-1 space-y-6">
        <Outlet />
      </section>
    </main>
  )
}
