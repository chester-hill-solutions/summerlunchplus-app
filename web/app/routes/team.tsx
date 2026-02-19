import { NavLink, Outlet, redirect, useLoaderData } from 'react-router'

import type { Route } from './+types/team'
import { requireAuth } from '@/lib/auth.server'
import { cn } from '@/lib/utils'

const ADMIN_ROLES = new Set(['admin', 'manager'])

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)

  if (!ADMIN_ROLES.has(auth.claims.role)) {
    throw redirect('/home', { headers: auth.headers })
  }

  return { role: auth.claims.role }
}

type NavItem = {
  to: string
  label: string
}

const teamNav: NavItem[] = [
  { to: '/team', label: 'Overview' },
  { to: '/team/users', label: 'Users' },
  { to: '/team/forms', label: 'Forms' },
  { to: '/team/class-management', label: 'Class Management' },
]

export default function TeamLayout() {
  useLoaderData<typeof loader>()

  return (
    <main className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
      <aside className="w-56 shrink-0">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">Team</h2>
          <nav className="mt-3 space-y-1">
            {teamNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/team'}
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

      <section className="flex-1 space-y-6">
        <Outlet />
      </section>
    </main>
  )
}
